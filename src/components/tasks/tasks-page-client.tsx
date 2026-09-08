'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'
import { ListTodo, LayoutGrid, List, Plus, ChevronLeft, Pencil, Trash2 } from 'lucide-react'

import type { Project } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TaskBoard } from './task-board'
import { TaskList } from './task-list'
import { TaskFormDialog } from './task-form-dialog'
import { ProjectFormDialog } from './project-form-dialog'
import { STATUSES, STATUS_META, PRIORITIES, PRIORITY_META } from './task-meta'
import type { TaskWithRelations } from '@/lib/db/queries/tasks'

const NONE = '_none_'

interface TasksPageClientProps {
  initialTaskId?: string
  tasks: TaskWithRelations[]
  properties: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  users: { id: string; fullName: string }[]
  currentUserId: string
  isAdmin: boolean
  project: Project
  projects: { id: string; name: string }[]
  canDeleteProject: boolean
}

export function TasksPageClient({
  tasks,
  properties,
  teams,
  users,
  currentUserId,
  isAdmin,
  project,
  projects,
  canDeleteProject,
  initialTaskId,
}: TasksPageClientProps) {
  const router = useRouter()
  const [view, setView] = useQueryState('view', { defaultValue: 'board' })
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState(NONE)
  const [teamFilter, setTeamFilter] = useState(NONE)
  const [statusFilter, setStatusFilter] = useState(NONE)
  const [priorityFilter, setPriorityFilter] = useState(NONE)
  const [assigneeFilter, setAssigneeFilter] = useState(NONE)

  const [dialogOpen, setDialogOpen] = useState(() => tasks.some(t => t.id === initialTaskId))
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(() => tasks.find(t => t.id === initialTaskId) ?? null)

  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [showDeleteProject, setShowDeleteProject] = useState(false)
  const [deleteProjectPending, setDeleteProjectPending] = useState(false)

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (propertyFilter !== NONE && t.propertyId !== propertyFilter) return false
      if (teamFilter !== NONE && !t.teams.some((tm) => tm.id === teamFilter)) return false
      if (statusFilter !== NONE && t.status !== statusFilter) return false
      if (priorityFilter !== NONE && t.priority !== priorityFilter) return false
      if (assigneeFilter !== NONE && !t.assignees.some((a) => a.id === assigneeFilter)) return false
      return true
    })
  }, [tasks, search, propertyFilter, teamFilter, statusFilter, priorityFilter, assigneeFilter])

  function openNew() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEdit(task: TaskWithRelations) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  const canDelete = editingTask
    ? !editingTask.vehicleRenewal && !editingTask.visitReport && !editingTask.fleetReports.length && (isAdmin || editingTask.createdBy === currentUserId)
    : false

  async function handleDeleteProject() {
    setDeleteProjectPending(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to delete project')
        return
      }
      toast.success('Project deleted')
      router.push('/tasks')
    } catch {
      toast.error('Failed to delete project')
    } finally {
      setDeleteProjectPending(false)
      setShowDeleteProject(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/tasks"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
            <Pencil className="mr-1.5 size-4" />
            Edit
          </Button>
          {canDeleteProject && (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteProject(true)}>
              <Trash2 className="mr-1.5 size-4" />
              Delete
            </Button>
          )}
          <Button onClick={openNew}>
            <Plus className="mr-1.5 size-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-48"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {properties.length > 0 && (
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {teams.length > 0 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {users.length > 0 && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All assignees</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* View toggle */}
        <div className="ml-auto inline-flex h-9 items-center rounded-lg border bg-background p-1">
          <Button
            variant={view === 'board' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setView('board')}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setView('list')}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListTodo className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No tasks found</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {tasks.length === 0
              ? 'Get started by creating your first task.'
              : 'Try adjusting your filters.'}
          </p>
          {tasks.length === 0 && (
            <Button onClick={openNew}>
              <Plus className="mr-1.5 size-4" />
              Create Task
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <TaskBoard tasks={filtered} onEdit={openEdit} />
      ) : (
        <TaskList tasks={filtered} onEdit={openEdit} />
      )}

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        properties={properties}
        teams={teams}
        users={users}
        projects={projects}
        defaultProjectId={project.id}
        canDelete={canDelete}
        onSaved={() => setEditingTask(null)}
      />

      <ProjectFormDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        project={project}
        onSaved={() => {}}
      />

      <AlertDialog open={showDeleteProject} onOpenChange={setShowDeleteProject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{project.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={deleteProjectPending}
            >
              {deleteProjectPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
