import {
  CalendarClock,
  Route,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface FleetNavigationItem {
  title: 'My Rides' | 'Fleet' | 'Dispatch' | 'Vehicles' | 'Drivers' | 'Distances'
  href: string
  icon: LucideIcon
}

export function getFleetNavigationItems(
  canBookFleet: boolean,
  isFleetAdmin: boolean
): FleetNavigationItem[] {
  const items: FleetNavigationItem[] = [
    { title: 'My Rides', href: '/fleet/my-rides', icon: Route },
  ]
  if (canBookFleet || isFleetAdmin) items.push({ title: 'Fleet', href: '/fleet', icon: Truck })

  if (!isFleetAdmin) return items

  return [
    ...items,
    { title: 'Dispatch', href: '/fleet/dispatch', icon: CalendarClock },
    { title: 'Vehicles', href: '/admin/fleet/vehicles', icon: Truck },
    { title: 'Drivers', href: '/admin/fleet/drivers', icon: Users },
    { title: 'Distances', href: '/admin/fleet/distances', icon: Route },
  ]
}
