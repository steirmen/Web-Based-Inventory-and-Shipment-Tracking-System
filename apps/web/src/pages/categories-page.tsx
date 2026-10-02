import type { Category } from '@app/shared';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CategoryFormDialog } from '@/components/categories/category-form-dialog';
import { DeleteCategoryDialog } from '@/components/categories/delete-category-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCategories, useDeleteCategory } from '@/hooks/use-catalog';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { categoryProductsPath } from '@/lib/product-list-params';

type Editing = { mode: 'create' } | { mode: 'edit'; categoryId: string } | null;

/** Categories of the current organization with create, edit, and delete by permission. */
export function CategoriesPage() {
  const { organization, can } = useCurrentOrganization();
  const m = useMessages(catalog).categories;
  const categories = useCategories(organization.id);
  const remove = useDeleteCategory(organization.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = categories.data?.categories ?? [];
  // Look categories up by id so dialogs always show the latest data (e.g. a refreshed count).
  const byId = (id: string | null) => list.find((category) => category.id === id) ?? null;
  const editingCategory = editing?.mode === 'edit' ? byId(editing.categoryId) : null;
  const deleting = byId(deletingId);
  const showActions = can('CATEGORIES_UPDATE') || can('CATEGORIES_DELETE');

  const startCreate = () => {
    setNotice(null);
    setEditing({ mode: 'create' });
  };
  const startEdit = (category: Category) => {
    setNotice(null);
    setEditing({ mode: 'edit', categoryId: category.id });
  };
  const startDelete = (category: Category) => {
    setNotice(null);
    remove.reset();
    setDeletingId(category.id);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    const { name } = deleting;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeletingId(null);
        setNotice(m.deleted({ name }));
      },
    });
  };

  const addButton = (
    <Can permission="CATEGORIES_CREATE">
      <Button onClick={startCreate}>
        <Plus aria-hidden="true" />
        {m.add}
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} actions={addButton} />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {categories.isPending && <ListSkeleton label={m.loading} />}

      {categories.isError && (
        <ErrorState
          title={m.loadError}
          error={categories.error}
          onRetry={() => void categories.refetch()}
        />
      )}

      {categories.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<FolderTree className="size-5" aria-hidden="true" />}
          title={m.emptyTitle}
          description={m.emptyText}
          action={addButton}
        />
      )}

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <Table className="hidden @2xl:table">
            <TableHeader>
              <tr>
                <TableHead>{m.name}</TableHead>
                <TableHead>{m.descriptionColumn}</TableHead>
                <TableHead align="right">{m.products}</TableHead>
                {showActions && (
                  <TableHead>
                    <span className="sr-only">{m.actions}</span>
                  </TableHead>
                )}
              </tr>
            </TableHeader>
            <TableBody>
              {list.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="max-w-56 font-medium break-words">
                    {category.name}
                  </TableCell>
                  <TableCell className="max-w-md break-words text-muted-foreground">
                    {category.description ?? <span className="text-subtle-foreground">—</span>}
                  </TableCell>
                  <TableCell align="right" className="whitespace-nowrap">
                    <ProductCountLink category={category} />
                  </TableCell>
                  {showActions && (
                    <TableCell className="py-2">
                      <CategoryActions
                        category={category}
                        onEdit={startEdit}
                        onDelete={startDelete}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border @2xl:hidden" aria-label={m.list}>
            {list.map((category) => (
              <li key={category.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium break-words">{category.name}</p>
                  <span className="shrink-0 text-sm tabular-nums">
                    <ProductCountLink category={category} />
                  </span>
                </div>
                {category.description && (
                  <p className="text-sm break-words text-muted-foreground">
                    {category.description}
                  </p>
                )}
                {showActions && (
                  <CategoryActions category={category} onEdit={startEdit} onDelete={startDelete} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CategoryFormDialog
        open={editing !== null && (editing.mode === 'create' || editingCategory !== null)}
        category={editingCategory}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setNotice(message);
        }}
      />

      <DeleteCategoryDialog
        category={deleting}
        pending={remove.isPending}
        error={remove.isError ? remove.error : null}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

/** "3 products", linking to the product list filtered by this category. */
function ProductCountLink({ category }: { category: Category }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).categories;
  const label = m.productCount({ count: category.productCount });
  if (category.productCount === 0) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <Link
      to={categoryProductsPath(organization.id, category.id)}
      className="rounded-sm font-medium text-primary focus-ring hover:underline"
      aria-label={m.productCountIn({ label, name: category.name })}
    >
      {label}
    </Link>
  );
}

function CategoryActions({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  const m = useMessages(catalog).categories;
  return (
    <div className="flex flex-wrap items-center gap-1 @2xl:flex-nowrap @2xl:justify-end">
      <Can permission="CATEGORIES_UPDATE">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(category)}
          aria-label={m.editNamed({ name: category.name })}
        >
          <Pencil aria-hidden="true" />
          {m.edit}
        </Button>
      </Can>
      <Can permission="CATEGORIES_DELETE">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(category)}
          aria-label={m.deleteNamed({ name: category.name })}
        >
          <Trash2 aria-hidden="true" />
          {m.delete}
        </Button>
      </Can>
    </div>
  );
}
