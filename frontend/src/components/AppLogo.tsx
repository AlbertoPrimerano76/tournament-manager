import appLogo from '@/assets/app-logo.svg'

type AppLogoProps = {
  className?: string
}

export default function AppLogo({ className = 'h-10 w-10' }: AppLogoProps) {
  return <img src={appLogo} alt="Rugby Tournament Manager" className={className} />
}
