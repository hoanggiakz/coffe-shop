'use client';

import { useEffect, useState, useRef } from 'react';
import { chatApi } from '@/lib/api';
import { getChatSocket, disconnectSocket } from '@/lib/socket';
import toast from 'react-hot-toast';

interface ChatSession {
  id: string;
  customerName?: string;
  status: string;
  tableId?: string;
  messages?: { content?: string }[];
}

interface ChatMessage {
  id?: string;
  senderType?: string;
  senderName?: string;
  content?: string;
}

export default function StaffChatPage() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadChats = () => chatApi.list().then(setChats).catch(() => {});

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Socket connection for active chat
  useEffect(() => {
    if (!activeChat) return;

    const socket = getChatSocket();
    socket.connect();

    socket.emit('join', { tableId: activeChat.tableId });

    socket.on('joined', (data: unknown) => {
      setMessages((data as { messages?: ChatMessage[] })?.messages || []);
    });

    socket.on('new-message', (msg: unknown) => {
      setMessages((prev) => [...prev, msg as ChatMessage]);
    });

    socket.on('error', (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    });

    return () => {
      socket.off('joined');
      socket.off('new-message');
      socket.off('error');
      disconnectSocket();
    };
  }, [activeChat?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectChat = async (chat: ChatSession) => {
    setActiveChat(chat);
    try {
      const msgs = await chatApi.getMessages(chat.id);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  };

  const send = () => {
    if (!input.trim() || !activeChat) return;
    const socket = getChatSocket();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    socket.emit('send-message', {
      content: input.trim(),
      senderType: 'STAFF',
      senderName: user.name || 'Nhân viên',
      senderId: user.id,
    });
    setInput('');
  };

  const closeChat = async (chatId: string) => {
    try {
      await chatApi.list(); // placeholder – use close endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/close`, { method: 'PATCH' });
      if (res.ok) {
        toast.success('Đã đóng phiên chat');
        loadChats();
        if (activeChat?.id === chatId) {
          setActiveChat(null);
          setMessages([]);
        }
      }
    } catch {
      toast.error('Lỗi đóng chat');
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* Chat list */}
      <div className="w-80 bg-white rounded-xl shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b font-semibold">Phiên chat ({chats.length})</div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => selectChat(chat)}
              className={`px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition ${
                activeChat?.id === chat.id ? 'bg-brand-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{chat.customerName || 'Khách'}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  chat.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{chat.status}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-1">
                {chat.messages?.[0]?.content || 'Chưa có tin nhắn'}
              </p>
            </div>
          ))}
          {chats.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có phiên chat</p>
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 bg-white rounded-xl shadow-sm flex flex-col">
        {activeChat ? (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold">{activeChat.customerName || 'Khách'}</p>
                <p className="text-xs text-gray-500">Bàn: {activeChat.tableId?.slice(0, 8)}...</p>
              </div>
              {activeChat.status === 'OPEN' && (
                <button
                  onClick={() => closeChat(activeChat.id)}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200"
                >
                  Đóng chat
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.senderType === 'STAFF' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2 ${
                    msg.senderType === 'STAFF'
                      ? 'bg-brand-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}>
                    <p className="text-xs font-semibold mb-0.5 opacity-80">{msg.senderName}</p>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {activeChat.status === 'OPEN' && (
              <div className="p-3 border-t flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button onClick={send} className="bg-brand-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-brand-700 transition">
                  Gửi
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Chọn phiên chat để bắt đầu
          </div>
        )}
      </div>
    </div>
  );
}
