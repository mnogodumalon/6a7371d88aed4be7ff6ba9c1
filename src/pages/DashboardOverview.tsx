import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Dateneingabe } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { useRecordOverlayStack, RecordOverlayHost, RecordHeader, RecordOverlay } from '@/components/widgets/RecordView';
import { DateneingabeDetails } from '@/components/details/DateneingabeDetails';
import { DateneingabeDialog } from '@/components/dialogs/DateneingabeDialog';
import type { DateneingabeDialogDefaults } from '@/components/dialogs/DateneingabeDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconUserPlus, IconSearch, IconUsers, IconMail, IconPhone,
  IconTrash, IconPencil, IconUserCircle,
} from '@tabler/icons-react';

export default function DashboardOverview() {
  const {
    dateneingabe,
    setDateneingabe,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDefaults, setEditDefaults] = useState<DateneingabeDialogDefaults | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Dateneingabe | null>(null);

  // Search / filter
  const [search, setSearch] = useState('');

  // Overlay stack
  const overlay = useRecordOverlayStack<{ type: 'dateneingabe'; record: Dateneingabe }>();

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return dateneingabe;
    return dateneingabe.filter(r => {
      const fields = r.fields;
      return (
        fields.vorname?.toLowerCase().includes(q) ||
        fields.nachname?.toLowerCase().includes(q) ||
        fields.email?.toLowerCase().includes(q) ||
        fields.telefon?.toLowerCase().includes(q) ||
        fields.bemerkungen?.toLowerCase().includes(q)
      );
    });
  }, [dateneingabe, search]);

  // Recently added (last 5 by creation date)
  const recent = useMemo(
    () => [...dateneingabe].sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? '')).slice(0, 5),
    [dateneingabe]
  );

  // With email / with phone
  const withEmail = useMemo(() => dateneingabe.filter(r => r.fields.email).length, [dateneingabe]);
  const withPhone = useMemo(() => dateneingabe.filter(r => r.fields.telefon).length, [dateneingabe]);

  const openCreate = useCallback(() => {
    setEditDefaults(undefined);
    setEditingId(undefined);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((r: Dateneingabe) => {
    setEditDefaults({
      vorname: r.fields.vorname,
      nachname: r.fields.nachname,
      email: r.fields.email,
      telefon: r.fields.telefon,
      bemerkungen: r.fields.bemerkungen,
    });
    setEditingId(r.record_id);
    setDialogOpen(true);
    overlay.close();
  }, [overlay]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const snapshot = [...dateneingabe];
    setDateneingabe(prev => prev.filter(r => r.record_id !== deleteTarget.record_id));
    overlay.close();
    setDeleteTarget(null);
    try {
      await LivingAppsService.deleteDateneingabeEntry(deleteTarget.record_id);
      undoToast(
        `${deleteTarget.fields.vorname ?? ''} ${deleteTarget.fields.nachname ?? ''} gelöscht`.trim(),
        async () => {
          setDateneingabe(snapshot);
          await LivingAppsService.createDateneingabeEntry(deleteTarget.fields as any);
          fetchAll();
        }
      );
    } catch {
      setDateneingabe(snapshot);
      fetchAll();
    }
  }, [deleteTarget, dateneingabe, setDateneingabe, overlay, fetchAll]);

  // ─── Early returns ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Plain derivations ───
  const total = dateneingabe.length;
  const displayName = (r: Dateneingabe) =>
    [r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || '—';

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {total === 0
              ? 'Noch keine Kontakte erfasst — leg den ersten an.'
              : total === 1
              ? 'Ein Kontakt gespeichert.'
              : `${total} Kontakte insgesamt${withEmail > 0 ? ` · ${withEmail} mit E-Mail` : ''}.`}
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <IconUserPlus size={16} className="mr-2 shrink-0" />
          Neuer Kontakt
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        kpis={
          <StatStrip>
            <StatStripItem
              title="Kontakte"
              value={total}
              icon={<IconUsers size={16} />}
              tone="default"
            />
            <StatStripItem
              title="Mit E-Mail"
              value={withEmail}
              icon={<IconMail size={16} />}
              tone={withEmail > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title="Mit Telefon"
              value={withPhone}
              icon={<IconPhone size={16} />}
              tone={withPhone > 0 ? 'primary' : 'default'}
            />
          </StatStrip>
        }
        aside={
          <>
            <WorkList
              title="Zuletzt hinzugefügt"
              items={recent.map(r => ({
                id: r.record_id,
                title: displayName(r),
                secondLine: (
                  <span className="text-muted-foreground text-xs truncate">
                    {r.fields.email ?? r.fields.telefon ?? 'Keine Kontaktdaten'}
                  </span>
                ),
              }))}
              onItemClick={id => {
                const r = dateneingabe.find(x => x.record_id === id);
                if (r) overlay.replace({ type: 'dateneingabe', record: r });
              }}
              empty={{
                text: 'Noch keine Einträge',
                action: { label: 'Ersten Kontakt anlegen', onClick: openCreate },
              }}
            />
          </>
        }
        primary={
          <div className="flex flex-col gap-4">
            {/* Search bar */}
            <div className="relative">
              <IconSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0"
              />
              <Input
                placeholder="Suchen nach Name, E-Mail, Telefon …"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Empty state */}
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <IconUserCircle size={48} className="text-muted-foreground" stroke={1.5} />
                <div>
                  <p className="font-semibold text-foreground">Noch keine Kontakte</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Erfasse deinen ersten Kontakt mit Name, E-Mail und Telefon.
                  </p>
                </div>
                <Button onClick={openCreate}>
                  <IconUserPlus size={16} className="mr-2 shrink-0" />
                  Ersten Kontakt erfassen
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <IconSearch size={32} className="text-muted-foreground" stroke={1.5} />
                <p className="text-sm text-muted-foreground">
                  Keine Kontakte für <strong>"{search}"</strong> gefunden.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                  Suche zurücksetzen
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-Mail</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefon</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Bemerkungen</th>
                        <th className="px-4 py-3 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr
                          key={r.record_id}
                          className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => overlay.replace({ type: 'dateneingabe', record: r })}
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            <span className="truncate block max-w-[200px]">{displayName(r)}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.fields.email ? (
                              <a
                                href={`mailto:${r.fields.email}`}
                                className="text-primary hover:underline truncate block max-w-[180px]"
                                onClick={e => e.stopPropagation()}
                              >
                                {r.fields.email}
                              </a>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.fields.telefon ? (
                              <a
                                href={`tel:${r.fields.telefon}`}
                                className="hover:underline"
                                onClick={e => e.stopPropagation()}
                              >
                                {r.fields.telefon}
                              </a>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                            <span className="truncate block max-w-[200px]">
                              {r.fields.bemerkungen ?? '—'}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Bearbeiten"
                                onClick={() => openEdit(r)}
                              >
                                <IconPencil size={15} />
                              </button>
                              <button
                                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Löschen"
                                onClick={() => setDeleteTarget(r)}
                              >
                                <IconTrash size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden flex flex-col gap-2">
                  {filtered.map(r => (
                    <div
                      key={r.record_id}
                      className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => overlay.replace({ type: 'dateneingabe', record: r })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{displayName(r)}</p>
                          {r.fields.email && (
                            <p className="text-sm text-primary truncate mt-0.5">{r.fields.email}</p>
                          )}
                          {r.fields.telefon && (
                            <p className="text-sm text-muted-foreground mt-0.5">{r.fields.telefon}</p>
                          )}
                          {r.fields.bemerkungen && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {r.fields.bemerkungen}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => openEdit(r)}
                          >
                            <IconPencil size={15} />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filtered.length < total && search && (
                  <p className="text-xs text-muted-foreground text-center">
                    {filtered.length} von {total} Kontakten
                  </p>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Record overlay */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => (
          <>
            <RecordHeader
              title={displayName(top.record)}
              subtitle={top.record.fields.email ?? top.record.fields.telefon}
            />
            <DateneingabeDetails record={top.record} />
          </>
        )}
        footer={top => ({
          label: 'Bearbeiten',
          onClick: () => openEdit(top.record),
        })}
        onEdit={top => openEdit(top.record)}
      />

      {/* Create / Edit dialog */}
      <DateneingabeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={async fields => {
          if (editingId) {
            await LivingAppsService.updateDateneingabeEntry(editingId, fields);
            undoToast('Kontakt aktualisiert');
          } else {
            await LivingAppsService.createDateneingabeEntry(fields);
            undoToast('Kontakt gespeichert');
          }
          fetchAll();
        }}
        defaultValues={editDefaults}
        recordId={editingId}
        enablePhotoScan={AI_PHOTO_SCAN['Dateneingabe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Dateneingabe']}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Kontakt löschen"
        description={`Soll "${deleteTarget ? displayName(deleteTarget) : ''}" wirklich gelöscht werden?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
