import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsGateway } from './events/events.gateway';
import { ParkingService } from './services/parking.service';
import { ParkingController } from './controllers/parking.controller';
import { PaymentService } from './services/payment.service';
import { PaymentController } from './controllers/payment.controller';
import { SimulationController } from './controllers/simulation.controller';
import { ParkingLot } from './entities/ParkingLot.entity';
import { ParkingZone } from './entities/ParkingZone.entity';
import { ParkingSpace } from './entities/ParkingSpace.entity';
import { User } from './entities/User.entity';
import { Vehicle } from './entities/Vehicle.entity';
import { ParkingLog } from './entities/ParkingLog.entity';
import { AssignmentLog } from './entities/AssignmentLog.entity';
import { FeePolicy } from './entities/FeePolicy.entity';
import { DiscountRule } from './entities/DiscountRule.entity';
import { PaymentLog } from './entities/PaymentLog.entity';

import { PolicyService } from './services/policy.service';
import { PolicyController } from './controllers/policy.controller';
import { PurchaseHistoryService } from './services/purchase-history.service';
import { PurchaseHistoryController } from './controllers/purchase-history.controller';
import { PurchaseHistory } from './entities/PurchaseHistory.entity';
import { AppliedDiscount } from './entities/AppliedDiscount.entity';

import { UserService } from './services/user.service';
import { UserController } from './controllers/user.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [
          ParkingLot,
          ParkingZone,
          ParkingSpace,
          User,
          Vehicle,
          ParkingLog,
          AssignmentLog,
          FeePolicy,
          DiscountRule,
          PaymentLog,
          PurchaseHistory,
          AppliedDiscount,
        ],
        synchronize: true, // Auto-create tables (dev only)
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      ParkingSpace,
      Vehicle,
      ParkingLog,
      AssignmentLog,
      PaymentLog,
      ParkingLot,
      ParkingZone,
      FeePolicy,
      DiscountRule,
      PurchaseHistory,
      AppliedDiscount,
      User,
    ]),
  ],
  controllers: [AppController, ParkingController, PaymentController, SimulationController, PolicyController, PurchaseHistoryController, UserController],
  providers: [AppService, EventsGateway, ParkingService, PaymentService, PolicyService, PurchaseHistoryService, UserService],
})
export class AppModule { }
