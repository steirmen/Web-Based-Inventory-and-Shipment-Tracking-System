import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DetailSkeleton, ListSkeleton } from '@/components/layout/page-state';
import { Alert } from './alert';
import { Button } from './button';
import { Dialog } from './dialog';
import { Menu, menuItemClass } from './menu';
import { SearchInput } from './search-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

describe('Table', () => {
  it('renders column headers with scope, right-aligned numbers, and a scroll wrapper', () => {
    render(
      <Table aria-label="Products">
        <TableHeader>
          <tr>
            <TableHead>Product</TableHead>
            <TableHead align="right">Price</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Pen</TableCell>
            <TableCell align="right">1.50</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'Products' });
    expect(within(table).getByRole('columnheader', { name: 'Product' })).toHaveAttribute(
      'scope',
      'col',
    );
    expect(within(table).getByRole('columnheader', { name: 'Price' })).toHaveClass('text-right');
    expect(within(table).getByRole('cell', { name: '1.50' })).toHaveClass(
      'text-right',
      'tabular-nums',
    );
    // A wide table scrolls inside its wrapper, never the page.
    expect(table.parentElement).toHaveClass('overflow-x-auto');
  });
});

describe('Alert', () => {
  it('can be dismissed when it offers a close button', async () => {
    const onDismiss = vi.fn<() => void>();
    render(
      <Alert tone="success" onDismiss={onDismiss}>
        Product saved.
      </Alert>,
    );

    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent('Product saved.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has no close button by default, and announces errors immediately', () => {
    render(<Alert tone="danger">Something failed.</Alert>);
    expect(within(screen.getByRole('alert')).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SearchInput', () => {
  it('is a search field with the standard length limit and an accessible name', () => {
    render(<SearchInput aria-label="Search products" placeholder="Name or SKU…" />);

    const input = screen.getByRole('searchbox', { name: 'Search products' });
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });
});

describe('Dialog', () => {
  it('uses the size presets and keeps the footer outside the scrolling body', () => {
    render(
      <Dialog open onClose={() => {}} title="New customer" size="md" footer={<Button>Save</Button>}>
        <p>Form fields</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'New customer' });
    expect(dialog).toHaveClass('max-w-lg');
    const body = screen.getByText('Form fields').parentElement!;
    expect(body).toHaveClass('overflow-y-auto');
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Save' }));
  });

  it('defaults to the confirmation size', () => {
    render(<Dialog open onClose={() => {}} title="Archive product?" />);
    expect(screen.getByRole('dialog', { name: 'Archive product?' })).toHaveClass('max-w-md');
  });
});

describe('Menu', () => {
  function renderMenu() {
    const onPick = vi.fn<(item: string) => void>();
    render(
      <Menu label="Account" trigger={(props) => <button {...props}>Open menu</button>}>
        {(close) =>
          ['First', 'Second', 'Third'].map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onPick(item);
                close();
              }}
            >
              {item}
            </button>
          ))
        }
      </Menu>,
    );
    return { onPick, trigger: screen.getByRole('button', { name: 'Open menu' }) };
  }

  it('opens with focus on the first item and moves with the arrow, Home, and End keys', async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes after an item is chosen and when clicking outside', async () => {
    const user = userEvent.setup();
    const { trigger, onPick } = renderMenu();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Second' }));
    expect(onPick).toHaveBeenCalledWith('Second');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Loading skeletons', () => {
  it('announce what is loading while the shapes stay decorative', () => {
    const { container } = render(
      <>
        <ListSkeleton label="Loading products" />
        <DetailSkeleton label="Loading order" />
      </>,
    );

    expect(screen.getByText('Loading products')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading order')).toHaveAttribute('aria-live', 'polite');
    const shapes = container.querySelectorAll('.animate-pulse');
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) expect(shape).toHaveAttribute('aria-hidden', 'true');
  });
});
