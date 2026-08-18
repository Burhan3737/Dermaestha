// @ts-check
import { Fragment, useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';
import { ADMIN_LINKS } from '../../../admin/admin.routes.jsx';
import { usePatches } from '../../usePatches.js';

const STATUS_LABEL = {
  never_run: 'Never run',
  running: 'Running…',
  success: 'Succeeded',
  failed: 'Failed',
  interrupted: 'Interrupted',
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export function Patches() {
  const { patches, runPatch } = usePatches();
  const [confirmId, setConfirmId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const rows = patches.data?.patches ?? [];

  const confirmRun = () => {
    runPatch.mutate(confirmId, { onSettled: () => setConfirmId(null) });
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Patches</h1>
      <p className="help">Run a deployed database patch. Every run is recorded below.</p>

      {patches.isLoading && <p>Loading…</p>}
      {patches.error && <Alert variant="danger">{patches.error.message}</Alert>}
      {runPatch.error && <Alert variant="danger">{runPatch.error.message}</Alert>}

      {!patches.isLoading && rows.length === 0 && <p className="empty">No patches are deployed.</p>}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Patch</th>
              <th>Status</th>
              <th>Last run</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>
                    <strong>{p.id}</strong>
                    <div className="help">{p.description}</div>
                  </td>
                  <td>
                    {STATUS_LABEL[p.status] ?? p.status}
                    {p.drift && (
                      <span className="help danger" title="File changed since its last success">
                        {' '}
                        (file changed)
                      </span>
                    )}
                  </td>
                  <td>{fmt(p.lastExecution?.finishedAt ?? p.lastExecution?.startedAt)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    >
                      {expandedId === p.id ? 'Hide history' : 'History'}
                    </Button>{' '}
                    <Button size="sm" onClick={() => setConfirmId(p.id)} disabled={p.status === 'running'}>
                      Run
                    </Button>
                  </td>
                </tr>
                {expandedId === p.id && (
                  <tr>
                    <td colSpan={4}>
                      {p.executions.length === 0 ? (
                        <p className="help">No runs yet.</p>
                      ) : (
                        <ul className="patch-history">
                          {p.executions.map((e) => (
                            <li key={e.id}>
                              <strong>{STATUS_LABEL[e.status] ?? e.status}</strong> — started {fmt(e.startedAt)}
                              {e.finishedAt ? `, finished ${fmt(e.finishedAt)}` : ''}
                              {e.error && <div className="help danger">{e.error}</div>}
                              {e.result && <div className="help">{JSON.stringify(e.result)}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {confirmId && (
        <ConfirmDialog
          title="Run patch"
          intent="danger"
          confirmLabel="Run patch"
          isLoading={runPatch.isPending}
          onConfirm={confirmRun}
          onCancel={() => setConfirmId(null)}
        >
          <p>
            Run <strong>{confirmId}</strong> against the live database? It executes immediately and the
            run is recorded.
          </p>
        </ConfirmDialog>
      )}
    </SidebarLayout>
  );
}
