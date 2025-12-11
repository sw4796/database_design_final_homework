import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { PaymentService } from '../services/payment.service';

@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    @Post('pay')
    async pay(@Body() body: { parkingLogId: string, userId: string | null, method: string, amount: number, discountAmount?: number, forceFail?: boolean, transactionId?: string }) {
        return this.paymentService.pay(body.parkingLogId, body.amount, body.method, body.discountAmount, body.forceFail, body.transactionId, body.userId);
    }

    @Post('cancel')
    async cancel(@Body() body: { transactionId: string }) {
        return this.paymentService.cancelTransaction(body.transactionId);
    }

    @Post('preview')
    async preview(@Body() body: { plateNumber: string; userId?: string }) {
        return this.paymentService.previewFee(body.plateNumber, body.userId);
    }

    @Get('receipts')
    async getReceipts(
        @Query('userId') userId?: string,
        @Query('receiptNo') receiptNo?: string
    ) {
        return this.paymentService.getReceipts({ userId, receiptNo });
    }

    @Get('payable-vehicles')
    async getPayableVehicles(@Query('lotId') lotId: string) {
        return this.paymentService.getPayableVehicles(lotId);
    }
}
