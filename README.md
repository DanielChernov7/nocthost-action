# NoctHost ephemeral server action

Start a cloud server for the length of a GitHub Actions job and destroy it when the job ends, even if the job fails. Useful for integration tests against a real VM, load tests from a chosen city, testing an install script on a clean Ubuntu box, or a build that needs more CPU or RAM than a hosted runner.

Servers come from [NoctHost](https://nocthost.com), which deploys on Vultr, Hetzner, DigitalOcean and Linode from one prepaid balance and bills by the hour. A typical server is running within a minute ([measured deploy times by cloud and city](https://nocthost.com/deploy-time)).

## Usage

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - id: vm
        uses: DanielChernov7/nocthost-action@v1
        with:
          api-key: ${{ secrets.NOCTHOST_API_KEY }}
          plan: vc2-1c-1gb
          region: fra
          ssh-key: ${{ secrets.CI_SSH_PUBLIC_KEY }}

      - name: Run tests against the server
        run: |
          echo "${{ secrets.CI_SSH_PRIVATE_KEY }}" > key && chmod 600 key
          ssh -i key -o StrictHostKeyChecking=accept-new root@${{ steps.vm.outputs.ip }} 'uname -a'
```

The server is destroyed in the action's post step. Billing stops the same hour.

## Inputs

| Input | Default | Description |
|---|---|---|
| `api-key` | required | API key (`nh_...`) with the read, deploy and destroy scopes. Create it under Profile in the dashboard and store it as a secret. |
| `plan` | `vc2-1c-1gb` | Plan id. The catalog is in the [API docs](https://nocthost.com/docs/api). |
| `region` | `ams` | Region id, for example `ams`, `fra`, `nyc`, `sgp`. |
| `provider` | API default | `vultr`, `hetzner`, `digitalocean` or `linode`. |
| `os-id` | Ubuntu 22.04 | OS id from the catalog. |
| `ssh-key` | none | Public key installed for root at first boot. |
| `label` | `gha-<run id>-<attempt>` | Server label. |
| `wait-for-ssh` | `true` | Wait until the SSH port accepts connections. |
| `ssh-port` | `22` | Port checked by `wait-for-ssh`. |
| `timeout` | `600` | Seconds to wait for the server (and SSH). |
| `destroy` | `true` | Destroy the server in the post step. Set `false` to keep it. |
| `api-url` | `https://api.nocthost.com` | API base URL. |

## Outputs

| Output | Description |
|---|---|
| `server-id` | Id of the created server. |
| `ip` | Public IPv4 address. |
| `password` | Generated root password, masked in logs. Prefer `ssh-key`. |

## Notes

- The server id is saved before the action waits for it, so a timeout or a cancelled job still destroys the server.
- If the destroy call fails five times, the step fails with an error so the leftover server is visible. Delete it in the dashboard.
- The action has no dependencies and runs on Node 20.

Other ways to automate the same API: [Terraform provider](https://registry.terraform.io/providers/DanielChernov7/nocthost/latest), [npm](https://www.npmjs.com/package/nocthost) and [PyPI](https://pypi.org/project/nocthost/) SDKs, and an [MCP server](https://nocthost.com/docs/mcp).

## License

MIT
