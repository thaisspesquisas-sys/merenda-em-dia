import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff, RefreshCw, Trash2, Wifi } from "lucide-react";
import {
  getPendingOfflineMovements,
  removeOfflineMovement,
  subscribeOfflineOutbox,
  syncOfflineOutbox,
  type PendingOfflineMovement,
} from "@/lib/offline-sync";
import { fmtData, fmtQ } from "@/lib/estoque";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function OfflineSyncBar() {
  const qc = useQueryClient();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState<PendingOfflineMovement[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [openQueue, setOpenQueue] = useState(false);

  async function refreshPending() {
    const list = await getPendingOfflineMovements();
    setPending(list);
  }

  async function runSync(silent = false) {
    setSyncing(true);
    try {
      const res = await syncOfflineOutbox();
      await refreshPending();
      if (res.syncedCount > 0 || res.skippedDuplicates > 0) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["movimentos"] }),
          qc.invalidateQueries({ queryKey: ["movimentos-rede"] }),
          qc.invalidateQueries({ queryKey: ["produtos"] }),
        ]);
        if (!silent || res.syncedCount > 0) {
          toast.success(
            `${res.syncedCount} lançamento(s) offline sincronizado(s) com segurança e sem duplicidade!`,
          );
        }
      }
      if (res.errors.length > 0 && !silent) {
        toast.error(`Alguns itens aguardam revisão: ${res.errors[0]}`);
      }
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void refreshPending();
    const unsub = subscribeOfflineOutbox(() => {
      void refreshPending();
    });

    const onOnline = () => {
      setIsOnline(true);
      toast.info("Conexão restabelecida! Sincronizando dados com a nuvem…");
      void runSync(true);
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning(
        "Modo Offline ativo: você pode consultar os dados em cache e registrar movimentações que serão sincronizadas automaticamente.",
      );
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isOnline && pending.length === 0) return null;

  return (
    <>
      <div
        className={`no-print flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs font-medium ${
          !isOnline ? "bg-warning-soft text-warning" : "bg-primary/10 text-primary"
        }`}
      >
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <CloudOff className="h-4 w-4 shrink-0" />
              <span>
                <b>Conexão offline / instável:</b> Exibindo dados seguros em cache local.
                Lançamentos registrados agora serão sincronizados quando a internet retornar.
              </span>
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4 shrink-0" />
              <span>
                <b>{pending.length} lançamento(s)</b> aguardando sincronização com o banco de dados
                da Secretaria.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setOpenQueue(true)}
            >
              Ver fila ({pending.length})
            </Button>
          )}
          {isOnline && pending.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={syncing}
              onClick={() => void runSync(false)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />{" "}
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={openQueue} onOpenChange={setOpenQueue}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fila de Sincronização Offline ({pending.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              Estes registros foram salvos localmente com chave única anti-duplicidade e serão
              enviados ao servidor assim que a conexão estiver estável.
            </p>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Data</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Produto</th>
                    <th className="p-2 text-right">Qtd.</th>
                    <th className="p-2">Unidade Escolar</th>
                    <th className="p-2">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{fmtData(item.data)}</td>
                      <td className="p-2 uppercase font-semibold">{item.tipo}</td>
                      <td className="p-2 font-medium">{item.productName}</td>
                      <td className="p-2 text-right tabular-nums">{fmtQ(item.quantidade)}</td>
                      <td className="p-2">{item.schoolName}</td>
                      <td className="p-2">
                        {item.status === "error" ? (
                          <span className="text-destructive">{item.errorMessage || "Erro"}</span>
                        ) : (
                          <span className="text-warning">Aguardando envio</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void removeOfflineMovement(item.id)}
                          aria-label="Remover da fila"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isOnline && pending.length > 0 && (
              <div className="flex justify-end">
                <Button disabled={syncing} onClick={() => void runSync(false)}>
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizar
                  todos os registros
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
