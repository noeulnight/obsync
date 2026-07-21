import { IsString, Matches, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @MinLength(32)
  deviceCode!: string;
}

export class DeviceApprovalDto {
  @Matches(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  userCode!: string;
}
