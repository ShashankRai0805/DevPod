import * as k8s from '@kubernetes/client-node';

export const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();

export const coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
export const appsApi = kubeConfig.makeApiClient(k8s.AppsV1Api);
export const networkingApi = kubeConfig.makeApiClient(k8s.NetworkingV1Api);