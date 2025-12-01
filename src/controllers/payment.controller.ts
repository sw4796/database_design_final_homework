import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from '../services/payment.service';

@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    @Get('calculate')
    async calculateFee(@Query('plateNumber') plateNumber: string) {
        return this.paymentService.calculateFee(plateNumber);
    }

    @Post('pay')
    async pay(@Body() body: { plateNumber: string; amount: number; method: string }) {
        return this.paymentService.processPayment(body.plateNumber, body.amount, body.method);
    }
}
