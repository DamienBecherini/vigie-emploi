// Arrêt automatique du tableau de bord après une période sans activité (contrat « service local »).
// Toutes les requêtes comptent, sauf le contrôle de santé : l'interface n'interroge pas le serveur à intervalle régulier.
// L'API traite chaque requête d'un bloc : le service n'a pas de travail de fond, donc jamais « occupé ».

export class Idle {
  readonly timeoutS: number;
  private readonly clock: () => number;
  private last: number;

  constructor(timeoutS: number, clock: () => number = () => performance.now() / 1000) {
    this.timeoutS = timeoutS;
    this.clock = clock;
    this.last = clock();
  }

  signal(): void {
    this.last = this.clock();
  }

  expired(): boolean {
    return this.timeoutS > 0 && this.clock() - this.last >= this.timeoutS;
  }

  /** Secondes avant l'arrêt ; null si l'arrêt automatique est désactivé. */
  remainingS(): number | null {
    if (this.timeoutS <= 0) return null;
    return Math.max(0, Math.round((this.timeoutS - (this.clock() - this.last)) * 10) / 10);
  }
}
