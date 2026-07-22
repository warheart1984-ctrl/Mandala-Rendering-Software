using System;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>Connection interface for MRS → Unity. Status: skeleton.</summary>
    public interface IMRSConnection : IDisposable
    {
        bool IsConnected { get; }
        event Action<MRSStateSnapshot> OnStateReceived;
        event Action<string> OnRawMessage;
        event Action OnConnected;
        event Action OnDisconnected;

        void Connect();
        void Disconnect();
        void SendPing();
        void RequestFrame(int frame);
    }
}
