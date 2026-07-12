import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config.js';

export interface ChatMessage {
  id: string;
  roomID: string;
  authorUserID: string;
  authorDisplayName: string;
  authorWasSeated: boolean;
  body: string;
  sentAt: string;
}

export interface UseChatResult {
  messages: ChatMessage[];
  sendMessage: (body: string) => void;
}

/**
 * Joins the room's dedicated /chat channel (separate from boardgame.io's
 * own game-state channel and from /presence, per tech-stack.md), sends
 * `hello` with { roomID, sessionToken } to authenticate, accumulates the
 * `chatHistory` snapshot on join then appends live `chatMessage` events.
 * Structurally mirrors usePresence.ts's connect/reconnect-on-remount
 * pattern.
 */
export function useChat(roomID: string | null, sessionToken: string | null): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomID || !sessionToken) return;
    setMessages([]);
    const socket = io(`${API_BASE_URL}/chat`, {
      path: '/chat-socket',
    });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('hello', { roomID, sessionToken }));
    socket.on('chatHistory', (history: ChatMessage[]) => setMessages(history));
    socket.on('chatMessage', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });
    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [roomID, sessionToken]);

  const sendMessage = useCallback((body: string) => {
    if (!roomID) return;
    socketRef.current?.emit('sendMessage', { roomID, body });
  }, [roomID]);

  return { messages, sendMessage };
}
