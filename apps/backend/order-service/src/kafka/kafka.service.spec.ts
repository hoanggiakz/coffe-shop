import { ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';
import { CustomLogger } from '../common/logger.service';

describe('KafkaService', () => {
  const configService = {
    get: jest.fn((key: string) => (key === 'KAFKA_BROKERS' ? 'localhost:9092' : '')),
  } as unknown as ConfigService;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    setContext: jest.fn(),
  } as unknown as CustomLogger;

  const mockProducer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  };

  let service: KafkaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KafkaService(configService, logger);
    (service as any).producer = mockProducer;
    (service as any).enabled = true;
  });

  it('connects producer on module init', async () => {
    mockProducer.connect.mockResolvedValueOnce(undefined);
    await service.onModuleInit();
    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('Kafka producer connected for order-service');
  });

  it('disconnects producer on module destroy', async () => {
    mockProducer.disconnect.mockResolvedValueOnce(undefined);
    await service.onModuleDestroy();
    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('Kafka producer disconnected for order-service');
  });

  it('publishes OrderCreated event', async () => {
    mockProducer.send.mockResolvedValueOnce(undefined);
    const published = await service.orderCreated({
      id: 'o1',
      tableId: 't1',
      status: 'PENDING',
      totalAmount: 100000,
      items: [{ id: 'i1' }],
    });

    expect(published).toBe(true);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'OrderCreated',
      messages: [
        {
          value: JSON.stringify({
            id: 'o1',
            tableId: 't1',
            status: 'PENDING',
            totalAmount: 100000,
            items: [{ id: 'i1' }],
          }),
        },
      ],
    });
    expect(logger.log).toHaveBeenCalledWith('Published OrderCreated event for order o1');
  });

  it('publishes OrderUpdated event', async () => {
    mockProducer.send.mockResolvedValueOnce(undefined);
    const published = await service.orderUpdated({
      id: 'o2',
      tableId: 't2',
      status: 'READY',
      totalAmount: 220000,
      items: [],
    });

    expect(published).toBe(true);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'OrderUpdated',
      messages: [
        {
          value: JSON.stringify({
            id: 'o2',
            tableId: 't2',
            status: 'READY',
            totalAmount: 220000,
            items: [],
          }),
        },
      ],
    });
    expect(logger.log).toHaveBeenCalledWith('Published OrderUpdated event for order o2');
  });

  it('returns false when kafka is disabled', async () => {
    (service as any).enabled = false;
    const published = await service.orderCreated({
      id: 'o3',
      tableId: 't3',
      status: 'PENDING',
      totalAmount: 50000,
      items: [],
    });
    expect(published).toBe(false);
    expect(mockProducer.send).not.toHaveBeenCalled();
  });

  it('publishes ItemCompleted event', async () => {
    mockProducer.send.mockResolvedValueOnce(undefined);
    const published = await service.itemCompleted({
      orderId: 'o4',
      orderItemId: 'oi4',
      menuItemId: 'm4',
      quantity: 2,
      branchId: 'b1',
      ingredients: [{ ingredientId: 'ing1', quantity: 20, note: 'menuItemId=m4' }],
      occurredAt: '2026-04-14T10:00:00.000Z',
    });

    expect(published).toBe(true);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'ItemCompleted',
      messages: [
        {
          value: JSON.stringify({
            orderId: 'o4',
            orderItemId: 'oi4',
            menuItemId: 'm4',
            quantity: 2,
            branchId: 'b1',
            ingredients: [{ ingredientId: 'ing1', quantity: 20, note: 'menuItemId=m4' }],
            occurredAt: '2026-04-14T10:00:00.000Z',
          }),
        },
      ],
    });
    expect(logger.log).toHaveBeenCalledWith('Published ItemCompleted event for order o4, item oi4');
  });
});
