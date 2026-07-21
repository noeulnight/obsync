import { BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';
import { resolveRequestId } from '../interceptors/request-logging.interceptor';
import { AppValidationPipe } from '../pipes/app-validation.pipe';

class ExampleDto {
  @IsString()
  name!: string;
}

describe('HTTP foundation', () => {
  it('preserves a safe request ID', () => {
    expect(resolveRequestId('client-request_1')).toBe('client-request_1');
  });

  it('replaces an unsafe request ID', () => {
    expect(resolveRequestId('unsafe request id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('rejects fields outside a DTO', async () => {
    const pipe = new AppValidationPipe();

    await expect(
      pipe.transform(
        { name: 'obsync', unexpected: true },
        { type: 'body', metatype: ExampleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
