import { afterEach } from 'vitest'
import { appBus } from '@/lib/app-bus'

afterEach(() => {
  appBus._resetForTests()
})
