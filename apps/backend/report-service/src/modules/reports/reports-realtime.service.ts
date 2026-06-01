import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { Gauge, register } from 'prom-client';

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
  private peakSubscribers = 0;
  private emitted = 0;
  private connectionCount = 0;
  private disconnectCount = 0;
  private subscriberDrops = 0;
  private readonly lagSamples: number[] = [];
  private readonly lagSampleLimit = 1000;
  private readonly lagP95Gauge: Gauge<string>;
  private readonly disconnectRateGauge: Gauge<string>;
  private readonly subscribersGauge: Gauge<string>;

  constructor() {
    this.lagP95Gauge = this.getOrCreateGauge(
      'realtime_lag_p95_ms',
      'P95 realtime event lag in milliseconds',
    );
    this.disconnectRateGauge = this.getOrCreateGauge(
      'realtime_disconnect_rate',
      'Realtime stream disconnect rate',
    );
    this.subscribersGauge = this.getOrCreateGauge(
      'realtime_active_subscribers',
      'Current active realtime subscribers',
    );
  }

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
    this.connectionCount += 1;
    this.subscribers += 1;
    this.subscribersGauge.set(this.subscribers);
    this.peakSubscribers = Math.max(this.peakSubscribers, this.subscribers);
    return new Observable<{ data: ReportRealtimeEvent }>((subscriber) => {
      const merged = merge(heartbeat$, refresh$).subscribe(subscriber);
      return () => {
        merged.unsubscribe();
        const previous = this.subscribers;
        this.subscribers = Math.max(this.subscribers - 1, 0);
        this.disconnectCount += 1;
        this.subscribersGauge.set(this.subscribers);
        if (previous > this.subscribers) {
          this.subscriberDrops += previous - this.subscribers;
        }
      };
    });
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
    const p95LagMs = this.computeP95(this.lagSamples);
    const disconnectRate =
      this.connectionCount <= 0 ? 0 : Number((this.disconnectCount / this.connectionCount).toFixed(4));
    const alerts = {
      p95LagHigh: p95LagMs >= 1500,
      subscriberDropHigh: this.subscriberDrops >= 5,
      disconnectRateHigh: disconnectRate >= 0.2,
    };
    this.lagP95Gauge.set(p95LagMs);
    this.disconnectRateGauge.set(disconnectRate);
    this.subscribersGauge.set(this.subscribers);
    return {
      subscribers: this.subscribers,
      peakSubscribers: this.peakSubscribers,
      emitted: this.emitted,
      connections: this.connectionCount,
      disconnects: this.disconnectCount,
      subscriberDrops: this.subscriberDrops,
      disconnectRate,
      lag: {
        samples: this.lagSamples.length,
        p95Ms: p95LagMs,
      },
      alerts,
      generatedAt: new Date().toISOString(),
    };
  }

  ingestLagSample(lagMsRaw: number) {
    const lag = Math.max(0, Number(lagMsRaw || 0));
    if (!Number.isFinite(lag)) return this.metrics();
    this.lagSamples.push(lag);
    if (this.lagSamples.length > this.lagSampleLimit) {
      this.lagSamples.splice(0, this.lagSamples.length - this.lagSampleLimit);
    }
    return this.metrics();
  }

  private computeP95(samples: number[]) {
    if (!samples.length) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return Number(sorted[idx].toFixed(2));
  }

  private getOrCreateGauge(name: string, help: string) {
    const existing = register.getSingleMetric(name);
    if (existing) {
      return existing as Gauge<string>;
    }
    return new Gauge({ name, help });
  }

  onModuleDestroy() {
    this.refresh$.complete();
  }
}
