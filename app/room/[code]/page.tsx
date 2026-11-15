import React from 'react';
import { DinnerGameApp } from '@/components/DinnerGameApp';

interface RoomPageProps {
  params: Promise<{
    code: string;
  }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  return <DinnerGameApp initialRoomCode={code} />;
}
