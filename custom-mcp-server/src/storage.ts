import { randomUUID } from 'crypto';

export interface Marathon {
  id: string;
  name: string;
  date: string; // ISO 8601 format (YYYY-MM-DD)
  distance: number; // in kilometers
  location: string;
  maxParticipants: number;
  registeredCount: number;
  createdAt: string;
}

export interface Runner {
  id: string;
  name: string;
  email: string;
  age: number;
  marathonsCompleted: number;
  totalDistance: number; // total km completed
  createdAt: string;
}

export interface Registration {
  id: string;
  runnerId: string;
  marathonId: string;
  status: 'registered' | 'completed' | 'cancelled';
  registeredAt: string;
  completedAt?: string;
}

class MarathonStorage {
  private marathons: Map<string, Marathon> = new Map();
  private runners: Map<string, Runner> = new Map();
  private registrations: Map<string, Registration> = new Map();

  // Marathon operations
  createMarathon(name: string, date: string, distance: number, location: string): Marathon {
    const id = randomUUID();
    const marathon: Marathon = {
      id,
      name,
      date,
      distance,
      location,
      maxParticipants: 1000,
      registeredCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.marathons.set(id, marathon);
    return marathon;
  }

  getMarathon(marathonId: string): Marathon | null {
    return this.marathons.get(marathonId) || null;
  }

  listMarathons(): Marathon[] {
    return Array.from(this.marathons.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  updateMarathon(marathonId: string, updates: Partial<Marathon>): Marathon | null {
    const marathon = this.marathons.get(marathonId);
    if (!marathon) return null;
    const updated = { ...marathon, ...updates, id: marathon.id };
    this.marathons.set(marathonId, updated);
    return updated;
  }

  // Runner operations
  createRunner(name: string, email: string, age: number): Runner {
    const id = randomUUID();
    const runner: Runner = {
      id,
      name,
      email,
      age,
      marathonsCompleted: 0,
      totalDistance: 0,
      createdAt: new Date().toISOString(),
    };
    this.runners.set(id, runner);
    return runner;
  }

  getRunner(runnerId: string): Runner | null {
    return this.runners.get(runnerId) || null;
  }

  getRunnerByEmail(email: string): Runner | null {
    return Array.from(this.runners.values()).find((r) => r.email === email) || null;
  }

  listRunners(): Runner[] {
    return Array.from(this.runners.values());
  }

  updateRunner(runnerId: string, updates: Partial<Runner>): Runner | null {
    const runner = this.runners.get(runnerId);
    if (!runner) return null;
    const updated = { ...runner, ...updates, id: runner.id };
    this.runners.set(runnerId, updated);
    return updated;
  }

  // Registration operations
  createRegistration(runnerId: string, marathonId: string): Registration | null {
    const runner = this.runners.get(runnerId);
    const marathon = this.marathons.get(marathonId);

    if (!runner || !marathon) return null;
    if (marathon.registeredCount >= marathon.maxParticipants) return null;

    const id = randomUUID();
    const registration: Registration = {
      id,
      runnerId,
      marathonId,
      status: 'registered',
      registeredAt: new Date().toISOString(),
    };

    this.registrations.set(id, registration);
    this.updateMarathon(marathonId, {
      registeredCount: marathon.registeredCount + 1,
    });

    return registration;
  }

  getRegistration(registrationId: string): Registration | null {
    return this.registrations.get(registrationId) || null;
  }

  getRunnerRegistrations(runnerId: string): Registration[] {
    return Array.from(this.registrations.values())
      .filter((r) => r.runnerId === runnerId)
      .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
  }

  getMarathonRegistrations(marathonId: string): Registration[] {
    return Array.from(this.registrations.values()).filter((r) => r.marathonId === marathonId);
  }

  updateRegistration(registrationId: string, status: Registration['status']): Registration | null {
    const registration = this.registrations.get(registrationId);
    if (!registration) return null;

    const updated: Registration = {
      ...registration,
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : registration.completedAt,
    };

    this.registrations.set(registrationId, updated);

    if (status === 'completed') {
      const runner = this.runners.get(registration.runnerId);
      const marathon = this.marathons.get(registration.marathonId);
      if (runner && marathon) {
        this.updateRunner(registration.runnerId, {
          marathonsCompleted: runner.marathonsCompleted + 1,
          totalDistance: runner.totalDistance + marathon.distance,
        });
      }
    }

    return updated;
  }

  cancelRegistration(registrationId: string): Registration | null {
    const registration = this.registrations.get(registrationId);
    if (!registration) return null;

    if (registration.status === 'registered') {
      const marathon = this.marathons.get(registration.marathonId);
      if (marathon) {
        this.updateMarathon(registration.marathonId, {
          registeredCount: Math.max(0, marathon.registeredCount - 1),
        });
      }
    }

    return this.updateRegistration(registrationId, 'cancelled');
  }

  // Seed with real upcoming Delhi-NCR races (registered via the same path the
  // create_marathon tool uses) so list_marathons has live data on every boot.
  seedSampleData(): void {
    this.createMarathon(
      'Kargil Vijay Diwas Half Marathon (5th Edition)',
      '2026-07-26',
      21.1,
      'Dwarka Sector 14, New Delhi'
    );
    this.createMarathon(
      'Dwarka Half Marathon (8th Edition)',
      '2026-08-02',
      21.1,
      'Dwarka, New Delhi'
    );
    this.createMarathon(
      'Tuffman Half Marathon Delhi (3rd Edition)',
      '2026-08-23',
      21.1,
      'JLN Stadium, Delhi'
    );

    // Create sample runners
    this.createRunner('Alice Johnson', 'alice@example.com', 28);
    this.createRunner('Bob Smith', 'bob@example.com', 35);
    this.createRunner('Charlie Brown', 'charlie@example.com', 42);
  }
}

export const storage = new MarathonStorage();
