import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { WhatsAppSession, Chat, Message } from './types';
import { QRCodeSVG } from 'qrcode.react';
import { MessageSquare, Plus, LogOut, Phone, User, Send, ChevronRight, Menu, X, Trash2, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const App: React.FC = () => {
    const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [chats, setChats] = useState<Record<string, Chat[]>>({});
    const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [newMessageText, setNewMessageText] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = io();
        socketRef.current = socket;

        socket.on('init', ({ sessions: initialSessions }: { sessions: WhatsAppSession[] }) => {
            setSessions(initialSessions);
        });

        socket.on('session_update', ({ sessionId, status, qr }: { sessionId: string; status: WhatsAppSession['status']; qr?: string }) => {
            setSessions(prev => {
                const existing = prev.find(s => s.id === sessionId);
                if (existing) {
                    return prev.map(s => s.id === sessionId ? { ...s, status, qr } : s);
                }
                return [...prev, { id: sessionId, status, qr }];
            });
        });

        socket.on('session_removed', ({ sessionId }: { sessionId: string }) => {
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (selectedSessionId === sessionId) setSelectedSessionId(null);
        });

        socket.on('chats_update', ({ sessionId, chats: updatedChats }: { sessionId: string; chats: Chat[] }) => {
            setChats(prev => ({ ...prev, [sessionId]: updatedChats }));
        });

        socket.on('new_message', ({ sessionId, message }: { sessionId: string; message: Message }) => {
            setMessages(prev => {
                const sessionMsgs = prev[sessionId] || [];
                return { ...prev, [sessionId]: [...sessionMsgs, message] };
            });
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const createSession = () => {
        const name = prompt('Nome para esta conta (ex: Comercial, Suporte):');
        if (name) {
            socketRef.current?.emit('create_session', { sessionId: name });
            setSelectedSessionId(name);
        }
    };

    const logout = (sessionId: string) => {
        if (confirm(`Tem certeza que deseja desconectar a conta "${sessionId}"?`)) {
            socketRef.current?.emit('logout', { sessionId });
        }
    };

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSessionId || !selectedChatJid || !newMessageText.trim()) return;

        socketRef.current?.emit('send_message', {
            sessionId: selectedSessionId,
            jid: selectedChatJid,
            text: newMessageText
        });
        setNewMessageText('');
    };

    const getChatName = (chat: Chat) => {
        return chat.name || chat.id.split('@')[0];
    };

    const currentSession = sessions.find(s => s.id === selectedSessionId);
    const sessionChats = selectedSessionId ? chats[selectedSessionId] || [] : [];
    const currentChat = sessionChats.find(c => c.id === selectedChatJid);

    return (
        <div className="flex h-screen bg-[#111b21] text-[#e9edef] overflow-hidden font-sans">
            {/* Sidebar Accounts */}
            <aside 
                className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 bg-[#202c33] border-r border-[#313d45] transition-all duration-300 flex flex-col`}
            >
                <div className="p-4 flex justify-between items-center bg-[#202c33] border-b border-[#313d45]">
                    <h1 className="font-bold text-xl flex items-center gap-2">
                        <Smartphone className="w-6 h-6 text-[#00a884]" />
                        ZapMulti
                    </h1>
                    <button 
                        onClick={createSession}
                        className="p-2 bg-[#00a884] rounded-full hover:bg-[#06cf9c] transition-colors"
                        title="Adicionar Número"
                    >
                        <Plus className="w-5 h-5 text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {sessions.length === 0 ? (
                        <div className="p-8 text-center text-[#8696a0] italic">
                            Nenhum número adicionado. Clique em + para começar.
                        </div>
                    ) : (
                        sessions.map(session => (
                            <div 
                                key={session.id}
                                onClick={() => {
                                    setSelectedSessionId(session.id);
                                    socketRef.current?.emit('get_chats', { sessionId: session.id });
                                }}
                                className={`p-4 cursor-pointer flex items-center gap-3 transition-colors ${selectedSessionId === session.id ? 'bg-[#2a3942]' : 'hover:bg-[#2a3942]'}`}
                            >
                                <div className="relative">
                                    <div className="w-12 h-12 bg-[#313d45] rounded-full flex items-center justify-center">
                                        <User className="w-7 h-7 text-[#8696a0]" />
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#202c33] ${
                                        session.status === 'connected' ? 'bg-[#00a884]' : 
                                        session.status === 'qr' ? 'bg-[#ffbc2b]' : 'bg-[#ef4444]'
                                    }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium truncate">{session.id}</h3>
                                    <p className="text-xs text-[#8696a0] capitalize">{session.status}</p>
                                </div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        logout(session.id);
                                    }}
                                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:text-[#ef4444]"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </aside>

            {/* Chat List */}
            {selectedSessionId && currentSession?.status === 'connected' && (
                <div className="w-96 flex-shrink-0 bg-[#111b21] border-r border-[#313d45] flex flex-col">
                    <div className="p-4 bg-[#202c33] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                             <div className="w-10 h-10 bg-[#313d45] rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-[#8696a0]" />
                            </div>
                            <span className="font-medium">{selectedSessionId}</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {sessionChats.map(chat => (
                            <div 
                                key={chat.id}
                                onClick={() => setSelectedChatJid(chat.id)}
                                className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-[#202c33] ${selectedChatJid === chat.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}
                            >
                                <div className="w-12 h-12 bg-[#313d45] rounded-full flex items-center justify-center flex-shrink-0">
                                    <User className="w-7 h-7 text-[#8696a0]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="font-medium truncate text-[#e9edef]">{getChatName(chat)}</h3>
                                    </div>
                                    <p className="text-sm text-[#8696a0] truncate">
                                        {chat.lastMessage || 'Sem mensagens recentes'}
                                    </p>
                                </div>
                                {chat.unreadCount ? (
                                    <div className="bg-[#00a884] text-[#111b21] text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                        {chat.unreadCount}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col bg-[#0b141a] relative">
                {!selectedSessionId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center mb-6">
                            <MessageSquare className="w-12 h-12 text-[#8696a0]" />
                        </div>
                        <h2 className="text-3xl font-light mb-4">ZapMulti Desktop</h2>
                        <p className="text-[#8696a0] max-w-md">
                            Conecte vários números do WhatsApp e gerencie todas as conversas em um único lugar sem sobrecarregar seu computador.
                        </p>
                        <div className="mt-8 flex items-center gap-2 text-[#8696a0] text-sm">
                            <Phone className="w-4 h-4" />
                            Versão 1.0.0
                        </div>
                    </div>
                ) : currentSession?.status === 'qr' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#202c33]">
                        <div className="bg-white p-6 rounded-lg shadow-2xl mb-8">
                            {currentSession.qr ? (
                                <QRCodeSVG value={currentSession.qr} size={256} />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-black">
                                    Gerando código QR...
                                </div>
                            )}
                        </div>
                        <h2 className="text-2xl font-bold mb-4">Vincule um novo aparelho</h2>
                        <ol className="text-[#8696a0] space-y-2 text-sm max-w-sm">
                            <li>1. Abra o WhatsApp no seu celular</li>
                            <li>2. Toque em Mais opções ou Configurações e selecione Aparelhos conectados</li>
                            <li>3. Toque em Conectar um aparelho</li>
                            <li>4. Aponte seu celular para esta tela para capturar o código</li>
                        </ol>
                    </div>
                ) : selectedChatJid ? (
                    <>
                        <header className="p-3 bg-[#202c33] flex items-center gap-3 border-b border-[#313d45]">
                             <div className="w-10 h-10 bg-[#313d45] rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-[#8696a0]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-medium">{currentChat ? getChatName(currentChat) : selectedChatJid}</h3>
                                <p className="text-xs text-[#8696a0]">Online</p>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                            <div className="flex flex-col gap-2">
                                <div className="self-center bg-[#182229] px-3 py-1 rounded-md text-[11px] text-[#8696a0] uppercase mb-4">
                                    Criptografia de ponta a ponta
                                </div>
                                <div className="text-center italic text-[#8696a0] text-sm my-8">
                                    As mensagens aparecerão aqui conforme forem enviadas ou recebidas.
                                </div>
                            </div>
                        </div>

                        <form onSubmit={sendMessage} className="p-3 bg-[#202c33] flex items-center gap-3">
                            <input 
                                type="text"
                                value={newMessageText}
                                onChange={(e) => setNewMessageText(e.target.value)}
                                placeholder="Digite uma mensagem"
                                className="flex-1 bg-[#2a3942] text-[#e9edef] rounded-md px-4 py-2 focus:outline-none placeholder-[#8696a0]"
                            />
                            <button 
                                type="submit"
                                disabled={!newMessageText.trim()}
                                className="p-2 text-[#8696a0] hover:text-[#00a884] transition-colors disabled:opacity-50"
                            >
                                <Send className="w-6 h-6" />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <h3 className="text-xl text-[#8696a0]">Selecione uma conversa para começar a digitar</h3>
                    </div>
                )}
            </main>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #374045;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
            `}} />
        </div>
    );
};

export default App;
