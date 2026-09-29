import { createElement } from 'react'
import {
  Bitcoin, Briefcase, Building, Car, CircleDollarSign, Coins, CreditCard, Gem, GraduationCap, HandHeart, Heart, House, KeyRound, Landmark,
  LifeBuoy, Package, PiggyBank, Plane, Receipt, Repeat, ShoppingBasket, Sofa, Ticket, TrendingUp, Tv, Umbrella, Users, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react'

// Icons are identity only (same neutral ink everywhere); colour stays reserved for the few series that carry meaning
const ICONS: Record<string, LucideIcon> = {
  // balance sheet
  Cash: Wallet,
  'Emergency Funds': LifeBuoy,
  PVD: Briefcase,
  'Insurance & Social Security': Umbrella,
  Bond: Landmark,
  Gold: Gem,
  Equity: TrendingUp,
  Crypto: Bitcoin,
  'Real Estate': Building,
  Mortgage: House,
  'Car Loan': Car,
  'Credit Card': CreditCard,
  'Other Debts': Receipt,
  Others: Package,
  // budget
  Salary: Briefcase,
  Rental: KeyRound,
  Family: Heart,
  Friends: Users,
  'Interest Money': Coins,
  Saving: PiggyBank,
  Investment: TrendingUp,
  Education: GraduationCap,
  Housing: Sofa,
  'Bills & Utilities': Zap,
  'Daily Living': ShoppingBasket,
  Tax: Receipt,
  Donation: HandHeart,
  Insurance: Umbrella,
  Debt: CreditCard,
  Travel: Plane,
  Activity: Ticket,
  'Subscription Bill': Repeat,
  Entertainment: Tv,
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  return createElement(ICONS[category] ?? CircleDollarSign, { className, 'aria-hidden': true })
}
