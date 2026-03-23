'use client';

export type OrderStatus = string;

export type OrderItem = {
  id: string;
  menuItemId?: string | null;
  quantity: number;
  price: number;
  status?: OrderStatus;
  note?: string | null;
};

export type OrderItemInput = {
  menuItemId: string;
  quantity: number;
  note?: string | null;
};

export type Order = {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  customerName?: string | null;
  customerPhone?: string | null;
  tableId?: string | null;
  orderItems?: OrderItem[];
};

export type Table = {
  id: string;
  number: number;
  capacity: number;
  area?: string | null;
  status: string;
};

export type ChatMessage = {
  id?: string;
  senderType: string;
  senderName?: string;
  senderId?: string;
  content: string;
  createdAt?: string;
};

export type ChatSession = {
  id: string;
  status: string;
  tableId?: string | null;
  customerName?: string | null;
  messages?: ChatMessage[];
};

export type User = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  phone?: string | null;
};
