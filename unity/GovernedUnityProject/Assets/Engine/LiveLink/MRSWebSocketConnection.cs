using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>
    /// WebSocket stub client for MRS live-link.
    /// Status: skeleton — connects and parses JSON state_snapshot; not CI-enforced.
    /// </summary>
    public sealed class MRSWebSocketConnection : IMRSConnection
    {
        readonly Uri _uri;
        readonly ConcurrentQueue<Action> _mainThread = new ConcurrentQueue<Action>();
        ClientWebSocket _ws;
        CancellationTokenSource _cts;
        Task _recvTask;

        public bool IsConnected => _ws != null && _ws.State == WebSocketState.Open;

        public event Action<MRSStateSnapshot> OnStateReceived;
        public event Action<string> OnRawMessage;
        public event Action OnConnected;
        public event Action OnDisconnected;

        public MRSWebSocketConnection(string url)
        {
            _uri = new Uri(url);
        }

        public void Connect()
        {
            Disconnect();
            _cts = new CancellationTokenSource();
            _ws = new ClientWebSocket();
            _recvTask = Task.Run(() => ConnectAndReceiveAsync(_cts.Token));
        }

        public void Disconnect()
        {
            try { _cts?.Cancel(); } catch { /* ignore */ }
            try { _ws?.Abort(); } catch { /* ignore */ }
            _ws = null;
            _cts = null;
        }

        public void Dispose() => Disconnect();

        public void SendPing() => SendJson("{\"type\":\"ping\"}");

        public void RequestFrame(int frame) =>
            SendJson($"{{\"type\":\"request_frame\",\"frame\":{frame}}}");

        /// <summary>Drain callbacks onto the Unity main thread (call from Update).</summary>
        public void PumpMainThread()
        {
            while (_mainThread.TryDequeue(out var action))
            {
                try { action(); } catch (Exception e) { Debug.LogWarning(e); }
            }
        }

        async Task ConnectAndReceiveAsync(CancellationToken ct)
        {
            try
            {
                await _ws.ConnectAsync(_uri, ct).ConfigureAwait(false);
                Enqueue(() => OnConnected?.Invoke());

                var buffer = new byte[1 << 16];
                while (!ct.IsCancellationRequested && _ws.State == WebSocketState.Open)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct)
                        .ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    var text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    HandleMessage(text);
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[MRS live-link] {e.Message}");
            }
            finally
            {
                Enqueue(() => OnDisconnected?.Invoke());
            }
        }

        void HandleMessage(string text)
        {
            Enqueue(() => OnRawMessage?.Invoke(text));
            try
            {
                // Minimal parse without JsonUtility dependency on nested arrays:
                // Prefer host sending Unity-friendly JSON; fall back to envelope.
                if (text.IndexOf("\"state_snapshot\"", StringComparison.Ordinal) >= 0 ||
                    text.IndexOf("\"type\":\"state_snapshot\"", StringComparison.Ordinal) >= 0)
                {
                    var snap = MRSJsonUtil.ParseStateSnapshot(text);
                    if (snap != null)
                        Enqueue(() => OnStateReceived?.Invoke(snap));
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[MRS live-link] parse: {e.Message}");
            }
        }

        void SendJson(string json)
        {
            if (!IsConnected) return;
            var bytes = Encoding.UTF8.GetBytes(json);
            _ = _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true,
                CancellationToken.None);
        }

        void Enqueue(Action a) => _mainThread.Enqueue(a);
    }
}
