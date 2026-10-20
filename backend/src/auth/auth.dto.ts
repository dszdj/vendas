import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @Matches(/^\+?[0-9\s().-]{10,20}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/)
  postalCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  state!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  neighborhood!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}
