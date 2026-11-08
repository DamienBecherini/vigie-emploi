// Arrêt automatique du tableau de bord après une période sans activité (contrat « service local »).
// Toutes les requêtes comptent, sauf le contrôle de santé : l'interface n'interroge pas le serveur à intervalle régulier.
// L'API traite chaque requête d'un bloc : le service n'a pas de travail de fond, donc jamais « occupé ».

export class Veille {
  readonly delaiS: number;
  private readonly horloge: () => number;
  private derniere: number;

  constructor(delaiS: number, horloge: () => number = () => performance.now() / 1000) {
    this.delaiS = delaiS;
    this.horloge = horloge;
    this.derniere = horloge();
  }

  signaler(): void {
    this.derniere = this.horloge();
  }

  expiree(): boolean {
    return this.delaiS > 0 && this.horloge() - this.derniere >= this.delaiS;
  }

  /** Secondes avant l'arrêt ; null si l'arrêt automatique est désactivé. */
  restantS(): number | null {
    if (this.delaiS <= 0) return null;
    return Math.max(0, Math.round((this.delaiS - (this.horloge() - this.derniere)) * 10) / 10);
  }
}
