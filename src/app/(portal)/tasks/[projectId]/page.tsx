import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getProjectById, getProjects } from '@/lib/db/queries/projects'
import { getTasks, getTaskTeams } from '@/lib/db/queries/tasks'
import { getAllProperties } from '@/lib/db/queries/properties'
import { getProfiles } from '@/lib/db/queries/profiles'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const dynamic = 'force-dynamic'

export default async function ProjectBoardPage({
  params,
  searchParams,
}: { params: Promise<{ projectId: string }>; searchParams: Promise<{ task?: string }> }) {
  const profile = await requireAuth()
  if (!profile) return null
  const { projectId } = await params
  const { task: initialTaskId } = await searchParams
  const project = await getProjectById(projectId)
  if (!project || project.orgId !== profile.orgId) notFound()
  const [tasks, teams, properties, users, allProjects] = await Promise.all([
    getTasks(profile.orgId, { projectId }),
    getTaskTeams(profile.orgId),
    getAllProperties(profile.orgId),
    getProfiles(profile.orgId),
    getProjects(profile.orgId, { includeArchived: true }),
  ])
  return (
    <TasksPageClient
      tasks={tasks}
      initialTaskId={initialTaskId}
      teams={teams}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
      currentUserId={profile.id}
      isAdmin={profile.role === 'admin'}
      project={project}
      projects={allProjects.map((p) => ({ id: p.id, name: p.name }))}
      canDeleteProject={profile.role === 'admin' || project.createdBy === profile.id}
    />
  )
}
