import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParkingLog } from '../entities/ParkingLog.entity';
import { PaymentLog } from '../entities/PaymentLog.entity';
import { Vehicle } from '../entities/Vehicle.entity';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(ParkingLog)
        private parkingLogRepository: Repository<ParkingLog>,
        @InjectRepository(PaymentLog)
        private paymentLogRepository: Repository<PaymentLog>,
        @InjectRepository(Vehicle)
        private vehicleRepository: Repository<Vehicle>,
        private eventsGateway: EventsGateway,
    ) { }

    async calculateFee(plateNumber: string): Promise<{ amount: number; durationMin: number }> {
        const vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const log = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'PARKED' },
            order: { entryTime: 'DESC' },
        });

        if (!log) throw new NotFoundException('No active parking log found');

        const now = new Date();
        const durationMs = now.getTime() - log.entryTime.getTime();
        const durationMin = Math.floor(durationMs / 1000 / 60);

        // Mock Fee Policy: Base 1000 KRW (30min) + 500 KRW per 10min
        let fee = 1000;
        if (durationMin > 30) {
            const extraMin = durationMin - 30;
            fee += Math.ceil(extraMin / 10) * 500;
        }

        return { amount: fee, durationMin };
    }

    async processPayment(plateNumber: string, amount: number, method: string): Promise<any> {
        const vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const log = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'PARKED' },
            relations: ['space', 'space.zone', 'space.zone.parkingLot'],
            order: { entryTime: 'DESC' },
        });

        if (!log) throw new NotFoundException('No active parking log found');

        // Create Payment Log
        const payment = this.paymentLogRepository.create({
            parkingLog: log,
            amount,
            paymentMethod: method,
        });
        await this.paymentLogRepository.save(payment);

        // Update Parking Log Status
        log.status = 'PAID';
        log.exitTime = new Date(); // Assuming exit happens roughly at payment for simulation
        await this.parkingLogRepository.save(log);

        // Broadcast Payment Success
        if (log.space?.zone?.parkingLot) {
            this.eventsGateway.broadcastToLot(
                log.space.zone.parkingLot.id,
                'paymentSuccess',
                { plateNumber, amount, spaceId: log.space.id }
            );
        }

        return { success: true, paymentId: payment.id };
    }
}
