import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ROOT_ENV_FILE, validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ROOT_ENV_FILE,
      validate: validateEnv,
    }),
    // Global in-memory rate-limit storage; limits are declared per route with @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    CatalogModule,
    InventoryModule,
    CustomersModule,
    OrdersModule,
    HealthModule,
  ],
})
export class AppModule {}
