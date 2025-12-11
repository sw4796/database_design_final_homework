import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseHistory } from '../entities/PurchaseHistory.entity';
import { User } from '../entities/User.entity';
import { ParkingLot } from '../entities/ParkingLot.entity';

@Injectable()
export class PurchaseHistoryService {
    constructor(
        @InjectRepository(PurchaseHistory)
        private purchaseHistoryRepository: Repository<PurchaseHistory>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async getPurchaseHistory(userId: string, lotId: string): Promise<PurchaseHistory[]> {
        return this.purchaseHistoryRepository.find({
            where: { user: { id: userId }, parkingLot: { id: lotId } },
            order: { purchaseTime: 'DESC' },
        });
    }

    async addPurchaseHistory(data: Partial<PurchaseHistory>, userId: string, lotId: string): Promise<PurchaseHistory> {
        // Ensure user exists (Fix for FK constraint error)
        let user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            user = this.userRepository.create({
                id: userId,
                name: '임시 회원', // Temporary Name
                phone: '000-0000-0000',
                grade: 'BRONZE'
            });
            await this.userRepository.save(user);
        }

        const history = this.purchaseHistoryRepository.create({
            ...data,
            user: user,
            parkingLot: { id: lotId } as ParkingLot,
            purchaseTime: new Date(),
        });
        return this.purchaseHistoryRepository.save(history);
    }
}
