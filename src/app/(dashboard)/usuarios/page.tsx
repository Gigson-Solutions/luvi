import { Users, Shield } from "lucide-react";
import { UserRole } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { listUsers } from "@/lib/services/user.service";
import {
  NewUserDialog,
  RoleSelect,
  RoleBadge,
  ToggleActiveButton,
  ResetPasswordDialog,
} from "./user-dialogs";
import { ROLES } from "./roles";

/** Descripción de cada rol (naming validado con cliente). */
const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  OPERARIO:
    "Acceso reducido, móvil-first: recepciones, producción, trazabilidad y almacén (lectura).",
  ADMINISTRACION:
    "Expediciones, consumibles y aprovisionamiento, además de la operativa de planta.",
  MANAGER: "Acceso completo excepto la configuración de sistema.",
  ADMIN:
    "Control total del sistema, incluida la gestión de usuarios y la configuración.",
};

export default async function UsuariosPage(): Promise<React.JSX.Element> {
  const [users, session] = await Promise.all([listUsers(), auth()]);
  const currentUserId = session?.user?.id ?? "";

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Gestión de usuarios y roles del sistema."
        actions={<NewUserDialog />}
      />

      {/* Tarjeta explicativa de roles */}
      <Card className="mb-6">
        <CardHeader className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--color-primary)]" />
          <CardTitle>Roles del sistema</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex items-start gap-3">
              <div className="shrink-0">
                <RoleBadge role={r} />
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                {ROLE_DESCRIPTIONS[r]}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay usuarios"
          description="Crea el primer usuario para dar acceso al sistema."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Usuario</TH>
              <TH>Email</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH>Alta</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <TR key={u.id}>
                  <TD className="font-medium">
                    {u.name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-[var(--color-muted)]">
                        (tú)
                      </span>
                    )}
                  </TD>
                  <TD>{u.email}</TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={u.role} />
                      <RoleSelect userId={u.id} role={u.role} />
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={u.active ? "green" : "neutral"}>
                      {u.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TD>
                  <TD>{formatDate(u.createdAt)}</TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <ResetPasswordDialog userId={u.id} name={u.name} />
                      <ToggleActiveButton
                        userId={u.id}
                        active={u.active}
                        isSelf={isSelf}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
