import { type RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  BattleEvent,
  type ReadyPayload,
  type GameStartPayload,
  type SendPoopPayload,
  type ScoreUpdatePayload,
  type GameOverPayload,
} from '../types/BattleTypes';

type BattlePayloadMap = {
  [BattleEvent.READY]: ReadyPayload;
  [BattleEvent.GAME_START]: GameStartPayload;
  [BattleEvent.SEND_POOP]: SendPoopPayload;
  [BattleEvent.SCORE_UPDATE]: ScoreUpdatePayload;
  [BattleEvent.GAME_OVER]: GameOverPayload;
};

/**
 * Supabase Realtime Broadcast 채널 래퍼
 *
 * ⚠️ Supabase Realtime은 `.on()` 리스너를 `.subscribe()` 전에 등록해야 합니다.
 * 따라서 채널 생성(createRoom/joinRoom) → 리스너 등록(onEvent 등) → 구독(subscribe) 순서로 호출하세요.
 */
export class BattleChannel {
  private channel: RealtimeChannel | null = null;
  private roomCode: string = '';
  private userId: string = '';

  /** 4자리 랜덤 방 코드 생성 */
  static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자(I,O,0,1) 제외
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /** 방 생성 (호스트) — 채널만 생성, subscribe는 별도 호출 */
  createRoom(code: string, userId: string): void {
    this.roomCode = code;
    this.userId = userId;
    this.createChannel();
  }

  /** 방 참가 (게스트) — 채널만 생성, subscribe는 별도 호출 */
  joinRoom(code: string, userId: string): void {
    this.roomCode = code;
    this.userId = userId;
    this.createChannel();
  }

  /** 채널 객체만 생성 (구독하지 않음) */
  private createChannel(): void {
    this.channel = supabase.channel(`battle-room:${this.roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.userId },
      },
    });
  }

  /**
   * 리스너 등록 완료 후 호출 — 실제 WebSocket 구독 시작 + Presence track
   * 반드시 onEvent/onPresenceJoin/onPresenceLeave 등록 후에 호출하세요.
   */
  async subscribe(): Promise<void> {
    if (!this.channel) return;
    return new Promise((resolve) => {
      this.channel!.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel!.track({ userId: this.userId, joinedAt: Date.now() });
          resolve();
        }
      });
    });
  }

  /** Broadcast 이벤트 리스너 등록 (subscribe 전에 호출) */
  onEvent<E extends BattleEvent>(event: E, callback: (payload: BattlePayloadMap[E]) => void): void {
    if (!this.channel) return;
    this.channel.on('broadcast', { event }, (msg) => {
      callback(msg.payload as BattlePayloadMap[E]);
    });
  }

  /** Presence 동기화 — 상대 참가 감지 (subscribe 전에 호출) */
  onPresenceJoin(callback: (userId: string) => void): void {
    if (!this.channel) return;
    this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      for (const p of newPresences) {
        const uid = (p as Record<string, unknown>).userId as string;
        if (uid && uid !== this.userId) {
          callback(uid);
        }
      }
    });
  }

  /** Presence 동기화 — 상대 이탈 감지 (subscribe 전에 호출) */
  onPresenceLeave(callback: (userId: string) => void): void {
    if (!this.channel) return;
    this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const p of leftPresences) {
        const uid = (p as Record<string, unknown>).userId as string;
        if (uid && uid !== this.userId) {
          callback(uid);
        }
      }
    });
  }

  /** 현재 Presence 상태에서 상대방이 있는지 확인 */
  getOpponentPresence(): string | null {
    if (!this.channel) return null;
    const state = this.channel.presenceState();
    for (const key of Object.keys(state)) {
      if (key !== this.userId) return key;
    }
    return null;
  }

  // ── 이벤트 송신 메서드 ──

  sendReady(characterId: string): void {
    this.broadcast(BattleEvent.READY, { userId: this.userId, characterId });
  }

  sendGameStart(timestamp: number): void {
    this.broadcast(BattleEvent.GAME_START, { timestamp });
  }

  sendPoop(count: number): void {
    this.broadcast(BattleEvent.SEND_POOP, { count });
  }

  sendScoreUpdate(score: number): void {
    this.broadcast(BattleEvent.SCORE_UPDATE, { score });
  }

  sendGameOver(finalScore: number): void {
    this.broadcast(BattleEvent.GAME_OVER, { userId: this.userId, finalScore });
  }

  private broadcast<E extends BattleEvent>(event: E, payload: BattlePayloadMap[E]): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  /** 채널 정리 (비동기 — untrack 후 채널 제거) */
  async destroy(): Promise<void> {
    if (this.channel) {
      await this.channel.untrack();
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /**
   * 채널 즉시 제거 (동기 — 씬 전환 전 호출용)
   *
   * supabase.channel()은 싱글턴이므로 removeChannel을 먼저 호출해야
   * 다음 씬에서 같은 이름으로 새 채널을 생성할 수 있다.
   */
  destroyImmediate(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  get code(): string {
    return this.roomCode;
  }

  get myUserId(): string {
    return this.userId;
  }
}
