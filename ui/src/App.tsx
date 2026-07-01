import { useEffect, useState } from 'react'
import Welcome from './screens/Welcome'
import JoinFlow from './screens/JoinFlow'
import PowerSetup from './screens/PowerSetup'
import Visibility from './screens/Visibility'
import Progress from './screens/Progress'
import MeshLive from './screens/MeshLive'
import Main from './screens/Main'
import { appApi } from './lib/api'
import { connect, useApp } from './lib/store'
import type { Visibility as Vis } from './lib/types'

type View =
  | { name: 'welcome' }
  | { name: 'join'; prefillToken?: string }
  | { name: 'join-setup'; token: string } // power setup for join-and-share
  | { name: 'host-setup' }
  | { name: 'host-visibility'; model: string }
  | { name: 'progress'; goal: 'host' | 'join' }
  | { name: 'main' }

export default function App() {
  const { phase } = useApp()
  const [view, setView] = useState<View>({ name: 'welcome' })
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    connect()
    appApi
      .state()
      .then((p) => {
        if (p.phase === 'running') setView({ name: 'main' })
        else if (p.phase !== 'idle' && p.phase !== 'error')
          setView({ name: 'progress', goal: 'host' })
      })
      .finally(() => setBooted(true))
  }, [])

  if (!booted) return null

  const leaveMesh = () => {
    void appApi.shutdown()
    setView({ name: 'welcome' })
  }

  switch (view.name) {
    case 'welcome':
      return (
        <Welcome
          onJoin={(prefillToken) => setView({ name: 'join', prefillToken })}
          onHost={() => setView({ name: 'host-setup' })}
        />
      )

    case 'join':
      return (
        <JoinFlow
          prefillToken={view.prefillToken}
          onBack={() => setView({ name: 'welcome' })}
          onSubmit={(token, share) => {
            if (share) {
              setView({ name: 'join-setup', token })
            } else {
              void appApi.join(token, false)
              setView({ name: 'progress', goal: 'join' })
            }
          }}
        />
      )

    case 'join-setup':
      return (
        <PowerSetup
          onBack={() => setView({ name: 'join', prefillToken: view.token })}
          onModelChosen={(model) => {
            void appApi.join(view.token, true, model)
            setView({ name: 'progress', goal: 'join' })
          }}
        />
      )

    case 'host-setup':
      return (
        <PowerSetup
          onBack={() => setView({ name: 'welcome' })}
          onModelChosen={(model) => setView({ name: 'host-visibility', model })}
        />
      )

    case 'host-visibility':
      return (
        <Visibility
          onBack={() => setView({ name: 'host-setup' })}
          onChosen={(visibility: Vis) => {
            void appApi.host(view.model, visibility)
            setView({ name: 'progress', goal: 'host' })
          }}
        />
      )

    case 'progress': {
      // Derived transition: once the backend reaches Running, hosts land on
      // the "mesh is live" QR moment and joiners go straight to the chat.
      if (phase.phase === 'running') {
        if (view.goal === 'host') {
          const done = () => setView({ name: 'main' })
          return (
            <MeshLive
              token={phase.invite_token}
              model={phase.model}
              isPrivate={phase.visibility === 'private'}
              onGoToChat={done}
            />
          )
        }
        return <Main onLeave={leaveMesh} />
      }
      return (
        <Progress
          onCancel={() => {
            void appApi.shutdown()
            setView({ name: 'welcome' })
          }}
          onErrorReset={() => {
            void appApi.reset()
            setView({ name: 'welcome' })
          }}
        />
      )
    }

    case 'main':
      return <Main onLeave={leaveMesh} />
  }
}
