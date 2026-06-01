package com.coffeeshop.userservice.service;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class HrRealtimeHub {
    private final Map<String, CopyOnWriteArrayList<SseEmitter>> branchEmitters = new ConcurrentHashMap<>();
    private final AtomicLong emittedEvents = new AtomicLong(0);

    public SseEmitter subscribe(String branchId) {
        String key = normalizeBranchId(branchId);
        SseEmitter emitter = new SseEmitter(0L);
        branchEmitters.computeIfAbsent(key, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> removeEmitter(key, emitter));
        emitter.onTimeout(() -> removeEmitter(key, emitter));
        emitter.onError(error -> removeEmitter(key, emitter));
        sendQuietly(emitter, "connected", Map.of(
                "type", "connected",
                "branchId", key,
                "emittedAt", LocalDateTime.now().toString()
        ));
        return emitter;
    }

    public void publish(String branchId, String type, Map<String, Object> payload) {
        String key = normalizeBranchId(branchId);
        CopyOnWriteArrayList<SseEmitter> emitters = branchEmitters.get(key);
        if (emitters == null || emitters.isEmpty()) return;
        emittedEvents.incrementAndGet();
        for (SseEmitter emitter : emitters) {
            sendQuietly(emitter, "hr-event", Map.of(
                    "type", type,
                    "branchId", key,
                    "emittedAt", LocalDateTime.now().toString(),
                    "payload", payload
            ));
        }
    }

    public Map<String, Object> metrics() {
        int subscribers = branchEmitters.values().stream().mapToInt(List::size).sum();
        return Map.of(
                "subscribers", subscribers,
                "branches", branchEmitters.size(),
                "emitted", emittedEvents.get(),
                "generatedAt", LocalDateTime.now().toString()
        );
    }

    private void sendQuietly(SseEmitter emitter, String eventName, Map<String, Object> payload) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
        } catch (IOException ignored) {
            emitter.complete();
        }
    }

    private void removeEmitter(String branchId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = branchEmitters.get(branchId);
        if (emitters == null) return;
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            branchEmitters.remove(branchId);
        }
    }

    private String normalizeBranchId(String branchId) {
        if (branchId == null) return "global";
        String normalized = branchId.trim();
        return normalized.isEmpty() ? "global" : normalized;
    }
}

