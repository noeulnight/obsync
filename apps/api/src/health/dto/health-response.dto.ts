export class HealthResponseDto {
  status!: 'ok';
}

export class ReadinessChecksResponseDto {
  config!: 'up';
  database!: 'up';
  storage!: 'up';
}

export class ReadinessResponseDto {
  status!: 'ready';
  checks!: ReadinessChecksResponseDto;
}
