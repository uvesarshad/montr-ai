import { connectMongoose } from '@/lib/mongodb';
import Strategy, { IStrategy, StrategyStatus } from '@/lib/db/models/strategy.model';
import StrategyRoadmap, { IStrategyRoadmap } from '@/lib/db/models/strategy-roadmap.model';

class StrategyRepository {
  private async ensureConnection() {
    await connectMongoose();
  }

  async create(data: Partial<IStrategy>): Promise<IStrategy> {
    await this.ensureConnection();
    const doc = new Strategy(data);
    return doc.save();
  }

  async findById(id: string): Promise<IStrategy | null> {
    await this.ensureConnection();
    return Strategy.findById(id).lean() as unknown as IStrategy | null;
  }

  async findByBrand(
    orgId: string,
    brandId?: string,
    status?: StrategyStatus,
  ): Promise<IStrategy[]> {
    await this.ensureConnection();
    const filter: Record<string, unknown> = { orgId };
    if (brandId) filter.brandId = brandId;
    if (status) filter.status = status;
    return Strategy.find(filter).sort({ createdAt: -1 }).lean() as unknown as IStrategy[];
  }

  async updateStatus(id: string, status: StrategyStatus): Promise<IStrategy | null> {
    await this.ensureConnection();
    return Strategy.findByIdAndUpdate(id, { status }, { new: true }).lean() as unknown as IStrategy | null;
  }

  async update(id: string, patch: Partial<IStrategy>): Promise<IStrategy | null> {
    await this.ensureConnection();
    return Strategy.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean() as unknown as IStrategy | null;
  }

  async getNextVersion(orgId: string, brandId: string): Promise<number> {
    await this.ensureConnection();
    const latest = await Strategy.findOne({ orgId, brandId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    return (latest?.version ?? 0) + 1;
  }

  // Roadmap helpers

  async createRoadmap(data: Partial<IStrategyRoadmap>): Promise<IStrategyRoadmap> {
    await this.ensureConnection();
    const doc = new StrategyRoadmap(data);
    return doc.save();
  }

  async getRoadmap(strategyId: string): Promise<IStrategyRoadmap | null> {
    await this.ensureConnection();
    return StrategyRoadmap.findOne({ strategyId }).lean() as unknown as IStrategyRoadmap | null;
  }

  async updateRoadmap(
    strategyId: string,
    patch: Partial<IStrategyRoadmap>,
  ): Promise<IStrategyRoadmap | null> {
    await this.ensureConnection();
    return StrategyRoadmap.findOneAndUpdate(
      { strategyId },
      { $set: patch },
      { new: true, upsert: false },
    ).lean() as unknown as IStrategyRoadmap | null;
  }
}

export const strategyRepository = new StrategyRepository();
