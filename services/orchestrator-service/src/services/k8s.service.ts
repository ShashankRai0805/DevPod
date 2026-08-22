import * as k8s from '@kubernetes/client-node'
import { appsApi, coreApi, networkingApi } from '../config/k8s'
import {
  AWS_REGION,
  K8S_NAMESPACE,
  REPL_BASE_DOMAIN,
  S3_BUCKET_NAME,
} from '../config/env'
import { resourceName, workspaceHost } from '../utils/naming'
import { ReplJobState } from '../types'

const states = new Map<string, ReplJobState>()

// Temporary image for Phase 2.
// This will later be replaced by your Runner image.
const deploymentImage = 'python:3.12-alpine'

const initImage = 'amazon/aws-cli:2.17.50'

const REPL_SERVICE_ACCOUNT = 'repl-workload'

function now() {
  return new Date().toISOString()
}

function setState(
  replId: string,
  patch: Partial<ReplJobState>
) {
  const previous = states.get(replId)

  const next: ReplJobState = {
    replId,
    status:
      patch.status ||
      previous?.status ||
      'provisioning',

    message:
      patch.message ??
      previous?.message,

    resourceNames:
      patch.resourceNames ??
      previous?.resourceNames,

    createdAt:
      previous?.createdAt ||
      now(),

    updatedAt: now(),
  }

  states.set(replId, next)

  return next
}

export function getState(replId: string) {
  return states.get(replId)
}

function namesFor(replId: string) {
  return {
    deployment: resourceName('repl-deploy', replId),
    service: resourceName('repl-svc', replId),
    ingress: resourceName('repl-ing', replId),
  }
}

/**
 * Make sure the application namespace exists.
 */
async function upsertNamespaceIfNeeded() {
  if (K8S_NAMESPACE === 'default') {
    return
  }

  try {
    await coreApi.readNamespace({
      name: K8S_NAMESPACE,
    })
  } catch (error: any) {
    const statusCode =
      error?.response?.statusCode ??
      error?.code ??
      error?.statusCode

    if (statusCode !== 404) {
      throw error
    }

    const namespace: k8s.V1Namespace = {
      metadata: {
        name: K8S_NAMESPACE,
      },
    }

    await coreApi.createNamespace({
      body: namespace,
    })
  }
}

/**
 * Create/update the Deployment for a Repl.
 *
 * Every Repl uses the SAME ServiceAccount:
 *
 *     replit/repl-workload
 *
 * The ServiceAccount is already connected to the
 * appropriate IAM role through IRSA.
 */
async function upsertDeployment(
  replId: string,
  names: ReturnType<typeof namesFor>
) {
  const host = workspaceHost(
    replId,
    REPL_BASE_DOMAIN
  )

  const deployment: k8s.V1Deployment = {
    metadata: {
      name: names.deployment,
      namespace: K8S_NAMESPACE,

      labels: {
        app: names.deployment,
        replId,
      },
    },

    spec: {
      replicas: 1,

      selector: {
        matchLabels: {
          app: names.deployment,
        },
      },

      template: {
        metadata: {
          labels: {
            app: names.deployment,
            replId,
          },
        },

        spec: {
          /*
           * IMPORTANT:
           *
           * All Repl Pods use the same ServiceAccount.
           *
           * repl-workload
           *      ↓
           * IAM Role
           *      ↓
           * S3
           */
          serviceAccountName: REPL_SERVICE_ACCOUNT,

          volumes: [
            {
              name: 'workspace-volume',

              emptyDir: {},
            },
          ],

          /*
           * INIT CONTAINER
           *
           * Runs before the main container.
           *
           * It copies:
           *
           * s3://BUCKET/users/<replId>/*
           *
           * into:
           *
           * /workspace
           */
          initContainers: [
            {
              name: 'copy-s3-resources',

              image: initImage,

              command: [
                '/bin/sh',
                '-c',
              ],

              args: [
                `
                set -e

                echo "Copying Repl ${replId} from S3..."

                aws s3 cp \
                  s3://${S3_BUCKET_NAME}/users/${replId}/ \
                  /workspace/ \
                  --recursive

                echo "Resources copied successfully."
                `,
              ],

              env: [
                {
                  name: 'AWS_REGION',
                  value: AWS_REGION,
                },
              ],

              volumeMounts: [
                {
                  name: 'workspace-volume',
                  mountPath: '/workspace',
                },
              ],
            },
          ],

          /*
           * TEMPORARY CONTAINER
           *
           * This is NOT the final Runner.
           *
           * For now it simply serves /workspace
           * so that we can verify:
           *
           * S3 → Pod → Service → Ingress
           */
          containers: [
            {
              name: 'workspace-server',

              image: deploymentImage,

              command: [
                'python',
                '-m',
                'http.server',
                '3000',
                '--bind',
                '0.0.0.0',
                '--directory',
                '/workspace',
              ],

              ports: [
                {
                  containerPort: 3000,
                },
              ],

              volumeMounts: [
                {
                  name: 'workspace-volume',
                  mountPath: '/workspace',
                },
              ],

              readinessProbe: {
                httpGet: {
                  path: '/',
                  port: 3000,
                },

                initialDelaySeconds: 5,

                periodSeconds: 5,
              },

              resources: {
                requests: {
                  cpu: '100m',
                  memory: '128Mi',
                },

                limits: {
                  cpu: '500m',
                  memory: '512Mi',
                  'ephemeral-storage': '1Gi' as any,
                },
              },
            },
          ],
        },
      },
    },
  }

  try {
    /*
     * Check whether Deployment already exists.
     */
    await appsApi.readNamespacedDeployment({
      name: names.deployment,
      namespace: K8S_NAMESPACE,
    })

    /*
     * Deployment exists → replace it.
     */
    await appsApi.replaceNamespacedDeployment({
      name: names.deployment,
      namespace: K8S_NAMESPACE,
      body: deployment,
    })

  } catch (error: any) {
    const statusCode =
      error?.response?.statusCode ??
      error?.code ??
      error?.statusCode

    /*
     * Deployment doesn't exist → create it.
     */
    if (statusCode === 404) {
      await appsApi.createNamespacedDeployment({
        namespace: K8S_NAMESPACE,
        body: deployment,
      })
    } else {
      throw error
    }
  }

  return host
}

/**
 * Create/update the Kubernetes Service for the Repl.
 */
async function upsertService(
  names: ReturnType<typeof namesFor>
) {
  const service: k8s.V1Service = {
    metadata: {
      name: names.service,
      namespace: K8S_NAMESPACE,

      labels: {
        app: names.deployment,
      },
    },

    spec: {
      type: 'ClusterIP',

      selector: {
        app: names.deployment,
      },

      ports: [
        {
          name: 'http',
          port: 3000,
          targetPort: 3000,
        },
      ],
    },
  }

  try {
    /*
     * Check whether Service exists.
     */
    await coreApi.readNamespacedService({
      name: names.service,
      namespace: K8S_NAMESPACE,
    })

    /*
     * Service exists → replace it.
     */
    await coreApi.replaceNamespacedService({
      name: names.service,
      namespace: K8S_NAMESPACE,
      body: service,
    })

  } catch (error: any) {
    const statusCode =
      error?.response?.statusCode ??
      error?.code ??
      error?.statusCode

    /*
     * Service doesn't exist → create it.
     */
    if (statusCode === 404) {
      await coreApi.createNamespacedService({
        namespace: K8S_NAMESPACE,
        body: service,
      })
    } else {
      throw error
    }
  }
}

/**
 * Create/update the Ingress for the Repl.
 */
async function upsertIngress(
  replId: string,
  names: ReturnType<typeof namesFor>
) {
  const host = workspaceHost(
    replId,
    REPL_BASE_DOMAIN
  )

  const ingress: k8s.V1Ingress = {
    metadata: {
      name: names.ingress,
      namespace: K8S_NAMESPACE,

      labels: {
        app: names.deployment,
      },
    },

    spec: {
      /*
       * This must match the IngressClass created
       * by your ingress-nginx controller.
       */
      ingressClassName: 'nginx',

      rules: [
        {
          host,

          http: {
            paths: [
              {
                path: '/',

                pathType: 'Prefix',

                backend: {
                  service: {
                    name: names.service,

                    port: {
                      number: 3000,
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  }

  try {
    /*
     * Check whether Ingress exists.
     */
    await networkingApi.readNamespacedIngress({
      name: names.ingress,
      namespace: K8S_NAMESPACE,
    })

    /*
     * Ingress exists → replace it.
     */
    await networkingApi.replaceNamespacedIngress({
      name: names.ingress,
      namespace: K8S_NAMESPACE,
      body: ingress,
    })

  } catch (error: any) {
    const statusCode =
      error?.response?.statusCode ??
      error?.code ??
      error?.statusCode

    /*
     * Ingress doesn't exist → create it.
     */
    if (statusCode === 404) {
      await networkingApi.createNamespacedIngress({
        namespace: K8S_NAMESPACE,
        body: ingress,
      })
    } else {
      throw error
    }
  }
}

/**
 * Wait until the Deployment has at least one
 * available replica.
 */
async function waitForReady(
  deploymentName: string
) {
  for (
    let attempt = 0;
    attempt < 60;
    attempt++
  ) {
    const response =
      await appsApi.readNamespacedDeploymentStatus({
        name: deploymentName,
        namespace: K8S_NAMESPACE,
      })

    const status = response.status

    const available =
      status?.availableReplicas || 0

    if (available > 0) {
      return
    }

    await new Promise(
      resolve => setTimeout(resolve, 2000)
    )
  }

  throw new Error(
    'Deployment did not become ready in time'
  )
}

/**
 * Start provisioning a Repl.
 *
 * Flow:
 *
 * Frontend
 *    ↓
 * Orchestrator
 *    ↓
 * Namespace
 *    ↓
 * Deployment
 *    ↓
 * InitContainer
 *    ↓
 * S3 → /workspace
 *    ↓
 * Main container
 *    ↓
 * Service
 *    ↓
 * Ingress
 */
export async function startProvisioning(
  replId: string
) {
  const current = states.get(replId)

  /*
   * Don't provision the same Repl multiple times.
   */
  if (
    current &&
    (
      current.status === 'provisioning' ||
      current.status === 'starting' ||
      current.status === 'ready'
    )
  ) {
    return current
  }

  const names = namesFor(replId)

  setState(replId, {
    status: 'provisioning',
    resourceNames: names,
  })

  void (async () => {
    try {
      setState(replId, {
        status: 'starting',
        resourceNames: names,
      })

      /*
       * 1. Make sure namespace exists.
       */
      await upsertNamespaceIfNeeded()

      /*
       * 2. Create/update Deployment.
       *
       * The Deployment uses:
       *
       * serviceAccountName: repl-workload
       */
      await upsertDeployment(
        replId,
        names
      )

      /*
       * 3. Create/update Service.
       */
      await upsertService(names)

      /*
       * 4. Create/update Ingress.
       */
      await upsertIngress(
        replId,
        names
      )

      /*
       * 5. Wait for Pod to become ready.
       */
      await waitForReady(
        names.deployment
      )

      /*
       * Everything is ready.
       */
      setState(replId, {
        status: 'ready',
        resourceNames: names,
      })

    } catch (error: any) {
      console.error(
        'Provisioning failed for repl',
        replId,
        error
      )

      setState(replId, {
        status: 'failed',
        message: 'Provisioning failed',
        resourceNames: names,
      })
    }
  })()

  return states.get(replId)!
}

/**
 * Get current provisioning status.
 */
export async function getProvisioningStatus(
  replId: string
) {
  const current = states.get(replId)

  if (current) {
    return current
  }

  return {
    replId,

    status: 'provisioning' as const,

    createdAt: now(),

    updatedAt: now(),
  }
}