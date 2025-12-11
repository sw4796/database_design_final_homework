import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PolicyService } from '../services/policy.service';

@Controller('policy')
export class PolicyController {
    constructor(private readonly policyService: PolicyService) { }

    @Get('fee')
    async getFeePolicies(@Query('lotId') lotId: string) {
        return this.policyService.getFeePolicies(lotId);
    }

    @Post('fee')
    async createFeePolicy(@Body() body: any, @Query('lotId') lotId: string) {
        return this.policyService.createFeePolicy(body, lotId);
    }

    @Put('fee/:id')
    async updateFeePolicy(@Param('id') id: string, @Body() body: any) {
        return this.policyService.updateFeePolicy(id, body);
    }

    @Delete('fee/:id')
    async deleteFeePolicy(@Param('id') id: string) {
        return this.policyService.deleteFeePolicy(id);
    }

    @Get('discount')
    async getDiscountRules(@Query('lotId') lotId: string) {
        return this.policyService.getDiscountRules(lotId);
    }

    @Post('discount')
    async createDiscountRule(@Body() body: any, @Query('lotId') lotId: string) {
        return this.policyService.createDiscountRule(body, lotId);
    }

    @Put('discount/:id')
    async updateDiscountRule(@Param('id') id: string, @Body() body: any) {
        return this.policyService.updateDiscountRule(id, body);
    }

    @Delete('discount/:id')
    async deleteDiscountRule(@Param('id') id: string) {
        return this.policyService.deleteDiscountRule(id);
    }
}
