import type { Currency, OrderStatus } from '@app/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** Client-facing order errors. */

/** Unknown, malformed, and other organizations' order ids all answer the same 404. */
export const orderNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');

export const orderNotEditable = (orderNumber: string, status: OrderStatus) =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORDER_NOT_EDITABLE',
    `Order ${orderNumber} is ${status.toLowerCase()}. Only draft orders can be edited.`,
  );

export const orderStatusInvalid = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'ORDER_STATUS_INVALID',
    'Order status cannot be set directly. Use confirm, process, ship, complete, or cancel.',
  );

const VERB: Record<OrderStatus, string> = {
  DRAFT: 'reopened as a draft',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processed',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const orderInvalidTransition = (orderNumber: string, from: OrderStatus, to: OrderStatus) =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORDER_INVALID_TRANSITION',
    `Order ${orderNumber} is ${from.toLowerCase()} and can't be ${VERB[to]}.`,
  );

export const orderEmpty = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_EMPTY',
    'Add at least one product to the order first.',
  );

export const orderCustomerNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_CUSTOMER_NOT_FOUND',
    'The selected customer does not exist in this workspace.',
  );

export const orderCustomerRequired = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_CUSTOMER_REQUIRED',
    'Choose a customer before confirming the order.',
  );

export const orderCustomerInactive = (name: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORDER_CUSTOMER_INACTIVE',
    `Customer ${name} is archived. Restore the customer or choose another one.`,
  );

export const orderWarehouseNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_WAREHOUSE_NOT_FOUND',
    'The selected warehouse does not exist in this workspace.',
  );

export const orderWarehouseInactive = (code: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORDER_WAREHOUSE_INACTIVE',
    `Warehouse ${code} is archived. Choose an active warehouse.`,
  );

export const orderProductNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_PRODUCT_NOT_FOUND',
    'A selected product does not exist in this workspace.',
  );

/** Orders never mix currencies: every line is in the currency of the order's first line. */
export const orderCurrencyMismatch = (label: string, product: Currency, order: Currency) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_CURRENCY_MISMATCH',
    `${label} is priced in ${product}, but this order is in ${order}. An order can't mix currencies.`,
  );

export const orderProductInactive = (label: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORDER_PRODUCT_INACTIVE',
    `${label} is archived. Remove it from the order or restore the product.`,
  );

export const orderTotalLimit = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'ORDER_TOTAL_LIMIT',
    'The order total is too large. Split it into several orders.',
  );

/** Same shape as every other validation error. */
export const orderDuplicateProducts = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The request contains invalid fields.',
    [
      {
        field: 'items',
        messages: ['Each product can appear only once; change its quantity instead.'],
      },
    ],
  );
