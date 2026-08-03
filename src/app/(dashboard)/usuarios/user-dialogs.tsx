"use client";

import { useActionState, useRef, useState } from "react";
import { Plus, KeyRound, Loader2, Check } from "lucide-react";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createUserAction,
  updateRoleAction,
  toggleActiveAction,
  resetPasswordAction,
  type ActionState,
} from "./actions";
import { ROLES, ROLE_LABELS, ROLE_TONES } from "./roles";

const INITIAL: ActionState = { ok: false };

// Re-export para no romper otros importadores cliente.
export { ROLES, ROLE_LABELS, ROLE_TONES };

export function RoleBadge({ role }: { role: UserRole }): React.JSX.Element {
  return <Badge tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Badge>;
}

// ─── Diálogo: crear usuario ────────────────────────────────────────────────────
export function NewUserDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createUserAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo usuario"
        description="Crea un usuario y asígnale un rol de acceso."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Nombre y apellidos"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="usuario@luvi2000.org"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <Label htmlFor="role">Rol</Label>
              <Select
                id="role"
                name="role"
                required
                defaultValue={UserRole.OPERARIO}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Crear usuario</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Select de rol inline (envía al cambiar) ───────────────────────────────────
/**
 * Selector de rol en línea. Llama al Server Action directamente (no vía
 * `form action`) para poder capturar fallos de red transitorios (503 en la
 * caja autohospedada bajo ráfagas de RSC) y reintentar una vez de forma
 * automática, en lugar de fallar en silencio. Da feedback visible: spinner
 * mientras guarda, ✓ al confirmar y un mensaje de error si de verdad no se
 * pudo (revirtiendo el select a su valor anterior).
 */
export function RoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}): React.JSX.Element {
  const [value, setValue] = useState<UserRole>(role);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const okTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function callWithRetry(fd: FormData): Promise<ActionState> {
    let lastErr: unknown;
    // 2 intentos: un 503 transitorio suele resolverse al reintentar.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await updateRoleAction(INITIAL, fd);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    throw lastErr;
  }

  async function handleChange(
    e: React.ChangeEvent<HTMLSelectElement>,
  ): Promise<void> {
    const next = e.currentTarget.value as UserRole;
    const prev = value;
    if (next === prev) return;
    if (okTimer.current) clearTimeout(okTimer.current);
    setValue(next); // optimista
    setStatus("saving");
    setError(null);

    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", next);

    try {
      const result = await callWithRetry(fd);
      if (result.ok) {
        setStatus("ok");
        okTimer.current = setTimeout(() => setStatus("idle"), 2000);
      } else {
        setValue(prev); // revertir
        setStatus("error");
        setError(result.error ?? "No se pudo cambiar el rol");
      }
    } catch {
      setValue(prev); // revertir
      setStatus("error");
      setError("No se pudo cambiar el rol. Reinténtalo.");
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Select
        name="role"
        value={value}
        disabled={status === "saving"}
        className="h-8 w-40 text-xs"
        onChange={handleChange}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {status === "saving" && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-muted)]" />
      )}
      {status === "ok" && (
        <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
      )}
      {status === "error" && error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

// ─── Botón activar / desactivar ────────────────────────────────────────────────
export function ToggleActiveButton({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}): React.JSX.Element {
  const [state, action] = useActionState(toggleActiveAction, INITIAL);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton
        variant={active ? "outline" : "primary"}
        pendingText="…"
        // No se puede desactivar a sí mismo
        {...(isSelf && active ? { disabled: true } : {})}
      >
        {active ? "Desactivar" : "Activar"}
      </SubmitButton>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

// ─── Diálogo: resetear contraseña ──────────────────────────────────────────────
export function ResetPasswordDialog({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await resetPasswordAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Restablecer contraseña">
          <KeyRound className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Restablecer contraseña · ${name}`}
        description="Introduce una nueva contraseña para este usuario."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div>
            <Label htmlFor={`password-${userId}`}>Nueva contraseña</Label>
            <Input
              id={`password-${userId}`}
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Restablecer</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
