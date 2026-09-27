const DEFAULTS = {
  mode: 'cloud', // "cloud" | "bridge"
  email: '',
  password: '',
  alias: '',
  cloudUrl: 'https://wap.tplinkcloud.com',
  bridgeUrl: '',
}

const MODES = ['cloud', 'bridge']

AppSettingsPage({
  state: {
    props: {},
    values: {},
  },

  get(key) {
    const raw = this.state.props.settingsStorage.getItem(key)
    return raw === undefined || raw === null || raw === '' ? DEFAULTS[key] : raw
  },

  set(key, val) {
    this.state.values[key] = val
    this.state.props.settingsStorage.setItem(key, String(val))
  },

  toggleMode() {
    const next = MODES[(MODES.indexOf(this.state.values.mode) + 1) % MODES.length]
    this.set('mode', next)
  },

  textField(key, label, opts) {
    opts = opts || {}
    return View(
      {
        style: {
          marginBottom: '14px',
        },
      },
      [
        Text(
          {
            style: {
              fontSize: '13px',
              color: '#666',
              marginBottom: '4px',
            },
          },
          label,
        ),
        TextInput({
          label: '',
          value: this.state.values[key],
          maxLength: opts.maxLength || 120,
          placeholder: opts.placeholder || '',
          subStyle: {
            color: '#222',
            fontSize: '15px',
          },
          onChange: (val) => {
            this.set(key, val)
          },
        }),
      ],
    )
  },

  build(props) {
    this.state.props = props
    Object.keys(DEFAULTS).forEach((k) => {
      this.state.values[k] = this.get(k)
    })

    const isCloud = this.state.values.mode === 'cloud'

    return View(
      {
        style: {
          padding: '16px 20px',
          backgroundColor: '#f6f6f6',
        },
      },
      [
        Text(
          {
            style: {
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#111',
              marginBottom: '4px',
            },
          },
          'zapp_switch',
        ),
        Text(
          {
            style: {
              fontSize: '13px',
              color: '#777',
              marginBottom: '18px',
            },
          },
          'Control your TP-Link Kasa bedroom light from your watch.',
        ),

        // ---- mode selector ----
        View(
          {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px',
            },
          },
          [
            Text({ style: { fontSize: '15px', color: '#222' } }, 'Control mode'),
            Button({
              label: this.state.values.mode === 'cloud' ? '☁️ Kasa Cloud' : '🏠 Local Bridge',
              style: {
                fontSize: '13px',
                borderRadius: '20px',
                background: '#f5b301',
                color: '#111',
                padding: '8px 16px',
              },
              onClick: () => {
                this.toggleMode()
              },
            }),
          ],
        ),

        isCloud
          ? View({}, [
              this.textField('email', 'Kasa account email', { placeholder: 'you@example.com' }),
              this.textField('password', 'Kasa account password'),
              this.textField('alias', 'Light name in Kasa app (optional — e.g. Bedroom Light)'),
              this.textField('cloudUrl', 'Cloud endpoint (leave default unless you know better)'),
            ])
          : View({}, [
              this.textField('bridgeUrl', 'Bridge URL', { placeholder: 'http://192.168.1.50:8765' }),
            ]),

        View(
          {
            style: {
              marginTop: '24px',
              padding: '12px',
              border: '1px solid #e3e3e3',
              borderRadius: '8px',
              backgroundColor: 'white',
            },
          },
          [
            Text(
              {
                style: { fontSize: '12px', color: '#888', lineHeight: '18px' },
              },
              'Credentials are stored only in this phone’s Zepp app storage and are sent directly to TP-Link’s servers. Cloud mode works anywhere your phone has internet. Bridge mode is faster and works without the cloud — see bridge/kasa_bridge.py in the repo.',
            ),
          ],
        ),
      ],
    )
  },
})
