import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';

export type ReportRealtimeEvent = {
  type: 'heartbeat' | 'refresh';
  emittedAt: string;
  branchId?: string | null;
  reason?: string;
};

@Injectable()
export class ReportsRealtimeService implements OnModuleDestroy {
  private readonly refresh$ = new Subject<ReportRealtimeEvent>();
  private subscribers = 0;
  private emitted = 0;

  stream(branchId?: string | null): Observable<{ data: ReportRealtimeEvent }> {
    const normalizedBranchId = String(branchId || '').trim() || null;
    const heartbeat$ = interval(5000).pipe(
      map(() => ({
        data: {
          type: 'heartbeat' as const,
          emittedAt: new Date().toISOString(),
          branchId: normalizedBranchId,
        },
      })),
    );
    const refresh$ = this.refresh$.pipe(
      map((event) => ({ data: event })),
    );
    this.subscribers += 1;
    return merge(heartbeat$, refresh$);
  }

  emitRefresh(branchId?: string | null, reason?: string) {
    this.emitted += 1;
    this.refresh$.next({
      type: 'refresh',
      emittedAt: new Date().toISOString(),
      branchId: String(branchId || '').trim() || null,
      reason: reason || 'report-data-updated',
    });
  }

  metrics() {
    return {
      subscribers: this.subscribers,
      emitted: this.emitted,
      generatedAt: new Date().toISOString(),
    };
  }

  onModuleDestroy() {
    this.refresh$.complete();
  }
}

