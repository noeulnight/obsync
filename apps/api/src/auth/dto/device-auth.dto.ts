import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @MinLength(32)
  deviceCode!: string;
}

export class DeviceApprovalDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @Matches(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  userCode!: string;

  @IsIn(['login', 'register'])
  action!: 'login' | 'register';
}
