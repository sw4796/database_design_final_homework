import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeePolicy } from '../entities/FeePolicy.entity';
import { DiscountRule } from '../entities/DiscountRule.entity';
import { ParkingLot } from '../entities/ParkingLot.entity';

@Injectable()
export class PolicyService {
    constructor(
        @InjectRepository(FeePolicy)
        private feePolicyRepository: Repository<FeePolicy>,
        @InjectRepository(DiscountRule)
        private discountRuleRepository: Repository<DiscountRule>,
    ) { }

    async getFeePolicies(lotId: string): Promise<FeePolicy[]> {
        return this.feePolicyRepository.find({ where: { parkingLot: { id: lotId }, isDeleted: false } });
    }

    async createFeePolicy(data: Partial<FeePolicy>, lotId: string): Promise<FeePolicy> {
        // If there's an existing active policy, we might want to deactivate it or just add a new one.
        // For simplicity, let's assume we just add a new one or update if ID is provided.
        // If the frontend sends an ID, it's an update. If not, it's a create.
        // But the controller separates them.
        // Let's check if there is already a policy for this lot, if so update it?
        // The frontend seems to handle one policy object.
        // Let's just create for now.
        const { id, ...createData } = data;
        const policy = this.feePolicyRepository.create({ ...createData, parkingLot: { id: lotId } as ParkingLot });
        return this.feePolicyRepository.save(policy);
    }

    async updateFeePolicy(id: string, data: Partial<FeePolicy>): Promise<FeePolicy> {
        // 1. Find the existing policy
        const existingPolicy = await this.feePolicyRepository.findOne({
            where: { id },
            relations: ['parkingLot'] // We need the parkingLot relation for the new policy
        });

        if (!existingPolicy) {
            throw new Error('FeePolicy not found');
        }

        // 2. Soft delete the existing policy
        existingPolicy.isDeleted = true;
        await this.feePolicyRepository.save(existingPolicy);

        // 3. Create a new policy with the updated data
        // We merge existing policy properties with the new data
        // We must exclude 'id' to generate a new one, and reset 'isDeleted'
        // We also exclude 'validFrom' so it defaults to current time for the new policy
        const { id: oldId, validFrom: oldValidFrom, ...policyData } = existingPolicy;

        // IMPORTANT: The input 'data' might also contain 'id' if the frontend sends the full object.
        // We must strip it out to ensure we create a NEW record.
        const { id: inputId, ...updateData } = data;

        const newPolicy = this.feePolicyRepository.create({
            ...policyData,
            ...updateData,
            isDeleted: false,
            // validFrom will be set to current timestamp by default since we excluded it
        });

        return this.feePolicyRepository.save(newPolicy);
    }

    async deleteFeePolicy(id: string): Promise<void> {
        await this.feePolicyRepository.update(id, { isDeleted: true });
    }

    async getDiscountRules(lotId: string): Promise<DiscountRule[]> {
        return this.discountRuleRepository.find({ where: { parkingLot: { id: lotId }, isDeleted: false } });
    }

    async createDiscountRule(data: Partial<DiscountRule>, lotId: string): Promise<DiscountRule> {
        const rule = this.discountRuleRepository.create({ ...data, parkingLot: { id: lotId } as ParkingLot });
        return this.discountRuleRepository.save(rule);
    }

    async updateDiscountRule(id: string, data: Partial<DiscountRule>): Promise<DiscountRule> {
        await this.discountRuleRepository.update(id, data);
        const updated = await this.discountRuleRepository.findOne({ where: { id } });
        if (!updated) throw new Error('DiscountRule not found');
        return updated;
    }

    async deleteDiscountRule(id: string): Promise<void> {
        await this.discountRuleRepository.update(id, { isDeleted: true });
    }
}
