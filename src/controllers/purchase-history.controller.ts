import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PurchaseHistoryService } from '../services/purchase-history.service';

@Controller('purchase-history')
export class PurchaseHistoryController {
    constructor(private readonly purchaseHistoryService: PurchaseHistoryService) { }

    @Get()
    async getPurchaseHistory(@Query('userId') userId: string, @Query('lotId') lotId: string) {
        return this.purchaseHistoryService.getPurchaseHistory(userId, lotId);
    }

    @Post()
    async addPurchaseHistory(@Body() body: any, @Query('userId') userId: string, @Query('lotId') lotId: string) {
        return this.purchaseHistoryService.addPurchaseHistory(body, userId, lotId);
    }
}
