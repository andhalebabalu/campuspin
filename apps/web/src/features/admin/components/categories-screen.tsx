'use client';

import {
  ATTRIBUTE_DATA_TYPES,
  PRICE_UNITS,
  type AdminAmenity,
  type AdminCategory,
  type AdminCategoryGroup,
  type AdminCategorySummary,
  type AttributeDataType,
  type PriceUnit,
} from '@platform/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { adminService } from '@/services/admin.service';
import { UNIT_LABELS } from '@/utils/format-price';
import { AdminHeader, SEARCH_CLASSES, SELECT_CLASSES, errorMessage } from './admin-ui';

const INPUT = `${SEARCH_CLASSES} w-full`;

/** A lowercase machine key from a label: "Seating capacity" -> "seating_capacity". */
const toKey = (label: string) =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

/**
 * The category tree (two levels: group -> category), each category's rating dimensions and extra
 * attributes, and the amenity list. Everything here is data: a new category is a row, not a deploy.
 */
export function CategoriesScreen() {
  const [groups, setGroups] = useState<AdminCategoryGroup[] | null>(null);
  const [amenities, setAmenities] = useState<AdminAmenity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([adminService.categories(), adminService.amenities()])
      .then(([tree, list]) => {
        setGroups(tree.data);
        setAmenities(list.data);
        setError(null);
      })
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not load categories.')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a change, then reloads the tree so every count and status is current. */
  async function run(work: () => Promise<unknown>) {
    setProblem(null);
    try {
      await work();
      load();
    } catch (caught) {
      setProblem(errorMessage(caught, 'That did not work.'));
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!groups || !amenities) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        title="Categories"
        description="Groups (e.g. Food) hold categories (e.g. Mess). Deactivating hides it from students; places keep it."
      />
      {problem && (
        <p className="rounded-md bg-danger-50 px-4 py-2 text-sm text-danger-700">{problem}</p>
      )}

      <section className="flex flex-col gap-4">
        {groups.map((group) => (
          <Card key={group.id} className="flex flex-col gap-3 p-5">
            <CategoryRow
              category={group}
              isGroup
              onSave={(dto) => run(() => adminService.updateCategory(group.id, dto))}
              onToggle={() =>
                run(() =>
                  adminService.categoryAction(
                    group.id,
                    group.status === 'ACTIVE' ? 'deactivate' : 'activate',
                  ),
                )
              }
            />
            <ul className="flex flex-col gap-2 border-l-2 border-line pl-4">
              {group.children.map((category) => (
                <li key={category.id} className="flex flex-col gap-2">
                  <CategoryRow
                    category={category}
                    onSave={(dto) => run(() => adminService.updateCategory(category.id, dto))}
                    onToggle={() =>
                      run(() =>
                        adminService.categoryAction(
                          category.id,
                          category.status === 'ACTIVE' ? 'deactivate' : 'activate',
                        ),
                      )
                    }
                    onOpen={() =>
                      setOpenId((current) => (current === category.id ? null : category.id))
                    }
                    open={openId === category.id}
                  />
                  {openId === category.id && (
                    <CategoryDetails categoryId={category.id} onError={setProblem} />
                  )}
                </li>
              ))}
              <li>
                <NewCategoryForm
                  placeholder={`New category in ${group.name}`}
                  onCreate={(name) =>
                    run(() =>
                      adminService.createCategory({
                        name,
                        parentId: group.id,
                        sortOrder: group.children.length,
                      }),
                    )
                  }
                />
              </li>
            </ul>
          </Card>
        ))}
        <NewCategoryForm
          placeholder="New group (e.g. Health)"
          onCreate={(name) =>
            run(() => adminService.createCategory({ name, sortOrder: groups.length }))
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Amenities</h2>
        <p className="text-sm text-body">Facilities a place can have (WiFi, AC, Parking…).</p>
        <Card className="flex flex-col divide-y divide-line">
          {amenities.map((amenity) => (
            <AmenityRow
              key={amenity.id}
              amenity={amenity}
              onRename={(name) => run(() => adminService.updateAmenity(amenity.id, { name }))}
              onToggle={() =>
                run(() =>
                  adminService.amenityAction(
                    amenity.id,
                    amenity.status === 'ACTIVE' ? 'deactivate' : 'activate',
                  ),
                )
              }
            />
          ))}
          <div className="p-3">
            <NewCategoryForm
              placeholder="New amenity (e.g. Power backup)"
              onCreate={(name) =>
                run(() =>
                  adminService.createAmenity({
                    name,
                    key: toKey(name),
                    sortOrder: amenities.length,
                  }),
                )
              }
            />
          </div>
        </Card>
      </section>
    </div>
  );
}

function CategoryRow({
  category,
  isGroup = false,
  onSave,
  onToggle,
  onOpen,
  open,
}: {
  category: AdminCategorySummary;
  isGroup?: boolean;
  onSave: (dto: {
    name: string;
    icon: string | null;
    defaultPriceUnit: PriceUnit | null;
  }) => Promise<void>;
  onToggle: () => Promise<void>;
  onOpen?: () => void;
  open?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? '');
  const [unit, setUnit] = useState<PriceUnit | ''>(category.defaultPriceUnit ?? '');

  if (editing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ name, icon: icon.trim() || null, defaultPriceUnit: unit || null }).then(
            () => setEditing(false),
          );
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${SEARCH_CLASSES} w-56`}
        />
        <input
          aria-label="Icon key"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="icon key"
          className={`${SEARCH_CLASSES} w-32`}
        />
        {!isGroup && (
          <select
            aria-label="Price unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as PriceUnit | '')}
            className={SELECT_CLASSES}
          >
            <option value="">No price unit</option>
            {PRICE_UNITS.map((value) => (
              <option key={value} value={value}>
                {UNIT_LABELS[value]}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={isGroup ? 'text-lg font-semibold text-ink' : 'font-medium text-ink'}>
          {category.name}
        </span>
        <span className="text-xs text-muted">/{category.slug}</span>
        {category.status === 'INACTIVE' && <Badge tone="danger">Inactive</Badge>}
        {category.defaultPriceUnit && <Badge>per {UNIT_LABELS[category.defaultPriceUnit]}</Badge>}
      </div>
      <div className="flex gap-1">
        {onOpen && (
          <Button size="sm" variant="ghost" onClick={onOpen}>
            {open ? 'Hide details' : 'Ratings & fields'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onToggle()}>
          {category.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
    </div>
  );
}

/** A category's rating dimensions (what reviewers can rate) and its extra attributes. */
function CategoryDetails({
  categoryId,
  onError,
}: {
  categoryId: string;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState<AdminCategory | null>(null);
  const [dimension, setDimension] = useState('');
  const [attrName, setAttrName] = useState('');
  const [attrType, setAttrType] = useState<AttributeDataType>('BOOLEAN');
  const [attrOptions, setAttrOptions] = useState('');

  useEffect(() => {
    adminService
      .category(categoryId)
      .then((result) => setCategory(result.data))
      .catch((caught: unknown) => onError(errorMessage(caught, 'Could not load the category.')));
  }, [categoryId, onError]);

  async function apply(work: () => Promise<{ data: AdminCategory }>) {
    try {
      setCategory((await work()).data);
    } catch (caught) {
      onError(errorMessage(caught, 'That did not work.'));
    }
  }

  if (!category) return <Skeleton className="h-24 w-full" />;
  const needsOptions = attrType === 'ENUM' || attrType === 'MULTI_ENUM';

  function addAttribute(event: FormEvent) {
    event.preventDefault();
    if (!attrName.trim()) return;
    const options = needsOptions
      ? attrOptions
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label) => ({ label, value: toKey(label) }))
      : undefined;
    void apply(() =>
      adminService.addAttribute(categoryId, {
        key: toKey(attrName),
        name: attrName.trim(),
        dataType: attrType,
        required: false,
        filterable: needsOptions || attrType === 'BOOLEAN',
        searchable: false,
        sortOrder: category?.attributes.length ?? 0,
        ...(options ? { options } : {}),
      }),
    ).then(() => {
      setAttrName('');
      setAttrOptions('');
    });
  }

  return (
    <div className="grid gap-4 rounded-md bg-subtle p-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink">Rating dimensions</p>
        <p className="text-xs text-muted">
          Optional scores reviewers can give, besides the overall stars.
        </p>
        {category.ratingDimensions.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span>{item.label}</span>
            <button
              type="button"
              className="text-xs text-danger-700 hover:underline"
              onClick={() =>
                void apply(() => adminService.removeRatingDimension(categoryId, item.id))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!dimension.trim()) return;
            void apply(() =>
              adminService.addRatingDimension(categoryId, {
                key: toKey(dimension),
                label: dimension.trim(),
                sortOrder: category.ratingDimensions.length,
              }),
            ).then(() => setDimension(''));
          }}
          className="flex gap-2"
        >
          <input
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            placeholder="e.g. Cleanliness"
            aria-label="New rating dimension"
            className={INPUT}
          />
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink">Extra fields</p>
        <p className="text-xs text-muted">
          Category-specific details, e.g. “Veg / Non-veg” for a mess.
        </p>
        {category.attributes.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span>
              {item.name}{' '}
              <span className="text-xs text-muted">({item.dataType.toLowerCase()})</span>
              {item.options && (
                <span className="text-xs text-muted">
                  {' '}
                  · {item.options.map((o) => o.label).join(', ')}
                </span>
              )}
            </span>
            <button
              type="button"
              className="text-xs text-danger-700 hover:underline"
              onClick={() => void apply(() => adminService.removeAttribute(categoryId, item.id))}
            >
              Remove
            </button>
          </div>
        ))}
        <form onSubmit={addAttribute} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={attrName}
              onChange={(e) => setAttrName(e.target.value)}
              placeholder="Field name"
              aria-label="New field name"
              className={INPUT}
            />
            <select
              aria-label="Field type"
              value={attrType}
              onChange={(e) => setAttrType(e.target.value as AttributeDataType)}
              className={SELECT_CLASSES}
            >
              {ATTRIBUTE_DATA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.toLowerCase().replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          {needsOptions && (
            <input
              value={attrOptions}
              onChange={(e) => setAttrOptions(e.target.value)}
              placeholder="Choices, comma-separated: Veg, Non-veg, Both"
              aria-label="Choices"
              className={INPUT}
            />
          )}
          <Button type="submit" size="sm" variant="secondary" className="w-fit">
            Add field
          </Button>
        </form>
      </div>
    </div>
  );
}

function AmenityRow({
  amenity,
  onRename,
  onToggle,
}: {
  amenity: AdminAmenity;
  onRename: (name: string) => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(amenity.name);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onRename(name).then(() => setEditing(false));
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Amenity name"
            className={`${SEARCH_CLASSES} w-56`}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      ) : (
        <span className="flex items-center gap-2 text-sm text-ink">
          {amenity.name}
          {amenity.status === 'INACTIVE' && <Badge tone="danger">Inactive</Badge>}
        </span>
      )}
      <div className="flex gap-1">
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Rename
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void onToggle()}>
          {amenity.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
    </div>
  );
}

function NewCategoryForm({
  placeholder,
  onCreate,
}: {
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        void onCreate(name.trim()).then(() => setName(''));
      }}
      className="flex max-w-md gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={INPUT}
      />
      <Button type="submit" size="sm" variant="secondary" className="shrink-0 whitespace-nowrap">
        + Add
      </Button>
    </form>
  );
}
