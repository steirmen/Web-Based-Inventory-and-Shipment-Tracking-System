import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** Client-facing product and category errors. */

export const categoryNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'CATEGORY_NOT_FOUND', 'Category not found.');

export const categoryNameTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'CATEGORY_NAME_TAKEN',
    'A category with this name already exists.',
  );

export const categoryInUse = (productCount: number) =>
  new AppException(
    HttpStatus.CONFLICT,
    'CATEGORY_IN_USE',
    productCount === 1
      ? 'This category is used by 1 product. Move that product to another category first.'
      : `This category is used by ${productCount} products. Move them to another category first.`,
  );

export const productNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Product not found.');

export const productSkuTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'PRODUCT_SKU_TAKEN',
    'Another product in this workspace already uses this SKU.',
  );

/** A referenced category id that does not exist in this organization (body or filter). */
export const productCategoryNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'PRODUCT_CATEGORY_NOT_FOUND',
    'The selected category does not exist in this workspace.',
  );

export const productStatusInvalid = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'PRODUCT_STATUS_INVALID',
    'Product status cannot be changed here. Use archive or restore instead.',
  );

export const productArchived = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'PRODUCT_ARCHIVED',
    'This product is archived. Restore it before editing.',
  );
