export interface WhatsAppSession {
  id: string;
  status: 'connecting' | 'qr' | 'connected' | 'disconnected';
  qr?: string | null;
}

export interface Chat {
  id: string;
  name?: string;
  unreadCount?: number;
  lastMessage?: string;
}

export interface Message {
  key: {
    remoteJid: string;
    fromMe?: boolean;
    id: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp?: number;
}
