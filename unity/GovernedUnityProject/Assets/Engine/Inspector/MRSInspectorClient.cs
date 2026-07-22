using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.Inspector
{
    /// <summary>
    /// MRS Inspector JSON/WebSocket client (INSPECTOR_PROTOCOL.md).
    /// Status: wires Editor ↔ Node inspector:ws; curvature remains stub-marked; not production scene binding.
    /// Transport matches live-link (System.Net.WebSockets.ClientWebSocket).
    /// </summary>
    public class MRSInspectorClient
    {
        public const string PrefEndpoint = "MRS.Inspector.Endpoint";
        public const string DefaultEndpoint = "ws://127.0.0.1:9490";

        public static MRSInspectorClient Instance { get; private set; }

        public string Endpoint { get; set; }
        public bool IsConnected => _ws != null && _ws.State == WebSocketState.Open;
        public event Action<Inspector4DResultDTO> OnResult;
        public event Action OnConnected;
        public event Action OnDisconnected;
        public event Action<string> OnStatus;

        readonly ConcurrentQueue<Action> _mainThread = new ConcurrentQueue<Action>();
        ClientWebSocket _ws;
        CancellationTokenSource _cts;
        Inspector4DResultDTO _last;
        string _lastWireJson;

        public MRSInspectorClient(string endpoint = null)
        {
            Endpoint = string.IsNullOrEmpty(endpoint)
                ? LoadEndpointPref()
                : endpoint;
            Instance = this;
        }

        public Inspector4DResultDTO LastResult => _last;
        public string LastWireJson => _lastWireJson;
        public bool UseStubWhenDisconnected { get; set; } = true;

        public static string LoadEndpointPref()
        {
#if UNITY_EDITOR
            return UnityEditor.EditorPrefs.GetString(PrefEndpoint, DefaultEndpoint);
#else
            return DefaultEndpoint;
#endif
        }

        public static void SaveEndpointPref(string endpoint)
        {
#if UNITY_EDITOR
            UnityEditor.EditorPrefs.SetString(PrefEndpoint, endpoint ?? DefaultEndpoint);
#endif
        }

        public void Connect(string endpoint = null)
        {
            if (!string.IsNullOrEmpty(endpoint))
            {
                Endpoint = endpoint;
                SaveEndpointPref(endpoint);
            }

            Disconnect();
            try
            {
                _cts = new CancellationTokenSource();
                _ws = new ClientWebSocket();
                _ = Task.Run(() => ConnectAndReceiveAsync(_cts.Token));
                RaiseStatus($"Connecting {Endpoint}…");
            }
            catch (Exception e)
            {
                RaiseStatus($"Connect failed: {e.Message}");
                Debug.LogWarning($"[MRS Inspector] connect: {e.Message}");
            }
        }

        public void Disconnect()
        {
            try { _cts?.Cancel(); } catch { /* ignore */ }
            try { _ws?.Abort(); } catch { /* ignore */ }
            _ws = null;
            _cts = null;
        }

        /// <summary>Drain callbacks onto the main/Editor thread.</summary>
        public void PumpMainThread()
        {
            while (_mainThread.TryDequeue(out var action))
            {
                try { action(); }
                catch (Exception e) { Debug.LogWarning($"[MRS Inspector] {e.Message}"); }
            }
        }

        /// <summary>
        /// Screen-space inspect. When connected, sends inspect_screen and returns last known
        /// (async result arrives via OnResult). When disconnected, returns labeled stub if enabled.
        /// </summary>
        public Inspector4DResultDTO InspectAtScreenPoint(Vector2 mousePos, int width = 0, int height = 0)
        {
            if (width <= 0) width = Mathf.Max(1, Screen.width);
            if (height <= 0) height = Mathf.Max(1, Screen.height);

            float sx = mousePos.x / width;
            float sy = 1f - (mousePos.y / height); // Unity GUI y-down → NDC-ish

            if (IsConnected)
            {
                var json =
                    $"{{\"type\":\"inspect_screen\",\"schemaVersion\":\"1.1\"," +
                    $"\"sx\":{F(sx)},\"sy\":{F(sy)},\"width\":{width},\"height\":{height}}}";
                SendJson(json);
                RaiseStatus($"Sent inspect_screen sx={sx:F3} sy={sy:F3}");
                return _last;
            }

            if (!UseStubWhenDisconnected)
            {
                var miss = new Inspector4DResultDTO
                {
                    ok = false,
                    schemaVersion = "1.1",
                    error = "not_connected",
                    curvatureStub = true,
                };
                SetResult(miss, null);
                return miss;
            }

            var stub = BuildDisconnectedStub(mousePos);
            SetResult(stub, null);
            RaiseStatus("Disconnected — using local stub (not live protocol)");
            return stub;
        }

        public void InspectAtRay(Vector4 origin, Vector4 direction)
        {
            if (!IsConnected)
            {
                RaiseStatus("InspectAtRay requires live connection");
                return;
            }

            var json =
                $"{{\"type\":\"inspect_ray\",\"schemaVersion\":\"1.1\"," +
                $"\"origin\":[{F(origin.x)},{F(origin.y)},{F(origin.z)},{F(origin.w)}]," +
                $"\"direction\":[{F(direction.x)},{F(direction.y)},{F(direction.z)},{F(direction.w)}]}}";
            SendJson(json);
        }

        public void InspectPrimitive(int primitiveId, Vector4 localParams)
        {
            if (!IsConnected)
            {
                RaiseStatus("InspectPrimitive requires live connection");
                return;
            }

            var json =
                $"{{\"type\":\"inspect_primitive\",\"schemaVersion\":\"1.1\"," +
                $"\"primitiveId\":{primitiveId}," +
                $"\"localParams\":[{F(localParams.x)},{F(localParams.y)},{F(localParams.z)},{F(localParams.w)}]}}";
            SendJson(json);
        }

        public void SetResult(Inspector4DResultDTO dto, string wireJson = null)
        {
            _last = dto;
            if (wireJson != null) _lastWireJson = wireJson;
            OnResult?.Invoke(dto);
        }

        async Task ConnectAndReceiveAsync(CancellationToken ct)
        {
            try
            {
                var uri = new Uri(Endpoint);
                await _ws.ConnectAsync(uri, ct).ConfigureAwait(false);
                Enqueue(() =>
                {
                    OnConnected?.Invoke();
                    RaiseStatus($"Connected {Endpoint}");
                });

                var buffer = new byte[1 << 16];
                var sb = new StringBuilder();
                while (!ct.IsCancellationRequested && _ws.State == WebSocketState.Open)
                {
                    sb.Clear();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct)
                            .ConfigureAwait(false);
                        if (result.MessageType == WebSocketMessageType.Close) goto done;
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    } while (!result.EndOfMessage);

                    HandleMessage(sb.ToString());
                }
            }
            catch (OperationCanceledException) { /* expected on disconnect */ }
            catch (Exception e)
            {
                Debug.LogWarning($"[MRS Inspector] {e.Message}");
                Enqueue(() => RaiseStatus($"Error: {e.Message}"));
            }
            finally
            {
                Enqueue(() =>
                {
                    OnDisconnected?.Invoke();
                    RaiseStatus("Disconnected");
                });
            }

            done: ;
        }

        void HandleMessage(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            if (text.IndexOf("\"pong\"", StringComparison.Ordinal) >= 0) return;

            Enqueue(() =>
            {
                try
                {
                    var dto = InspectorWireParser.ParseInspectResult(text);
                    if (dto == null)
                    {
                        RaiseStatus("Received non-inspect JSON");
                        return;
                    }
                    SetResult(dto, text);
                    RaiseStatus(dto.ok ? "inspect_result ok" : $"inspect_result error={dto.error}");
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[MRS Inspector] parse: {e.Message}");
                    RaiseStatus($"Parse error: {e.Message}");
                }
            });
        }

        void SendJson(string json)
        {
            if (!IsConnected || _ws == null) return;
            try
            {
                var bytes = Encoding.UTF8.GetBytes(json);
                _ = _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true,
                    CancellationToken.None);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[MRS Inspector] send: {e.Message}");
                RaiseStatus($"Send failed: {e.Message}");
            }
        }

        static Inspector4DResultDTO BuildDisconnectedStub(Vector2 mousePos)
        {
            return new Inspector4DResultDTO
            {
                ok = true,
                schemaVersion = "1.1",
                error = "stub_disconnected",
                position = new Vector4(mousePos.x * 0.01f, mousePos.y * 0.01f, 0f, 0f),
                normal4D = new Vector4(0, 0, 1, 0),
                tangent1 = new Vector4(1, 0, 0, 0),
                tangent2 = new Vector4(0, 1, 0, 0),
                k1 = 0f,
                k2 = 0f,
                curvatureStub = true,
                jacobian4x2 = Matrix4x4.identity,
                projectionMatrix = Matrix4x4.identity,
                rotationPlanes = new[]
                {
                    new RotationPlaneDTO
                    {
                        axisA = new Vector4(1, 0, 0, 0),
                        axisB = new Vector4(0, 0, 0, 1),
                        angle = 0f,
                        label = "x-w (stub)"
                    }
                },
                hyperplanes = Array.Empty<HyperplaneIntersectionDTO>(),
                topology = new TopologyDTO
                {
                    incidentCellIds = Array.Empty<int>(),
                    neighborCellIds = Array.Empty<int>(),
                    isBoundary = false
                },
                primitiveId = -1,
                faceIndex = -1
            };
        }

        void RaiseStatus(string s) => OnStatus?.Invoke(s);
        void Enqueue(Action a) => _mainThread.Enqueue(a);

        static string F(float v) => v.ToString("R", CultureInfo.InvariantCulture);
    }
}
