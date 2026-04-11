import { ArgumentsHost, HttpException, HttpStatus, LoggerService } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost(method: string, url: string, res: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  const request = { method, url };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const logger: LoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
  const filter = new HttpExceptionFilter(logger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles HttpException payload', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status, json };
    const host = createHost('POST', '/api/orders', res);
    const exception = new HttpException({ message: 'bad request' }, HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/api/orders',
        message: 'bad request',
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles unknown exception as internal error', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status, json };
    const host = createHost('GET', '/api/orders/health', res);

    filter.catch(new Error('unexpected'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/api/orders/health',
        message: 'Internal server error',
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
