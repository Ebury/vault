import Ember from 'ember';
import { inject as service } from '@ember/service';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { alias } from '@ember/object/computed';
import { maybeQueryRecord } from 'vault/macros/maybe-query-record';

const getErrorMessage = errors => {
  let errorMessage = errors?.join('. ') || 'Something went wrong. Check the Vault logs for more information.';
  return errorMessage;
};
export default class SecretDeleteMenu extends Component {
  @service store;
  @service router;
  @service flashMessages;

  @tracked showDeleteModal = false;

  @maybeQueryRecord(
    'capabilities',
    context => {
      if (!context.args || !context.args.modelForData || !context.args.modelForData.id) return;
      let [backend, id] = JSON.parse(context.args.modelForData.id);
      return {
        id: `${backend}/undelete/${id}`,
      };
    },
    'model.id'
  )
  undeleteVersionPath;
  @alias('undeleteVersionPath.canUpdate') canUndeleteVersion;

  @maybeQueryRecord(
    'capabilities',
    context => {
      if (!context.args || !context.args.modelForData || !context.args.modelForData.id) return;
      let [backend, id] = JSON.parse(context.args.modelForData.id);
      return {
        id: `${backend}/destroy/${id}`,
      };
    },
    'model.id'
  )
  destroyVersionPath;
  @alias('destroyVersionPath.canUpdate') canDestroyVersion;

  @maybeQueryRecord(
    'capabilities',
    context => {
      if (!context.args.model || !context.args.model.engine || !context.args.model.id) return;
      let backend = context.args.model.engine.id;
      let id = context.args.model.id;
      return {
        id: `${backend}/metadata/${id}`,
      };
    },
    'model',
    'model.id',
    'mode'
  )
  v2UpdatePath;
  @alias('v2UpdatePath.canDelete') canDestroyAllVersions;

  @maybeQueryRecord(
    'capabilities',
    context => {
      if (!context.args.model || context.args.mode === 'create') {
        return;
      }
      let backend = context.args.isV2 ? context.args.model.engine.id : context.args.model.backend;
      let id = context.args.model.id;
      let path = context.args.isV2 ? `${backend}/data/${id}` : `${backend}/${id}`;
      return {
        id: path,
      };
    },
    'isV2',
    'model',
    'model.id',
    'mode'
  )
  secretDataPath;
  @alias('secretDataPath.canDelete') canDeleteSecretData;

  @maybeQueryRecord(
    'capabilities',
    context => {
      if (!context.args.model || context.args.mode === 'create') {
        return;
      }
      let backend = context.args.isV2 ? context.args.model.engine.id : context.args.model.backend;
      let id = context.args.model.id;
      let path = context.args.isV2 ? `${backend}/delete/${id}` : `${backend}/${id}`;
      return {
        id: path,
      };
    },
    'isV2',
    'model',
    'model.id',
    'mode'
  )
  secretSoftDataPath;
  @alias('secretSoftDataPath.canUpdate') canSoftDeleteSecretData;

  get isLatestVersion() {
    // must have metadata access.
    let { model } = this.args;
    if (!model) return false;
    let latestVersion = model.currentVersion;
    let selectedVersion = model.selectedVersion.version;
    if (latestVersion !== selectedVersion) {
      return false;
    }
    return true;
  }

  @action
  handleDelete(deleteType) {
    // deleteType should be 'delete', 'destroy', 'undelete', 'delete-latest-version', 'destroy-all-versions', 'v1'
    if (!deleteType) {
      return;
    }
    if (deleteType === 'destroy-all-versions' || deleteType === 'v1') {
      this.args.model.destroyRecord().then(() => {
        return this.router.transitionTo('vault.cluster.secrets.backend.list-root');
      });
    } else {
      // if they do not have read access on the metadata endpoint we need to pull the version from modelForData so they can perform delete and undelete operations
      // only perform if no access to metatdata otherwise it will only delete latest version for any deleteType === delete
      let currentVersionForNoReadMetadata;
      if (!this.args.canReadSecretMetadata) {
        currentVersionForNoReadMetadata = this.args.modelForData?.version;
      }
      return this.store
        .adapterFor('secret-v2-version')
        .v2DeleteOperation(this.store, this.args.modelForData.id, deleteType, currentVersionForNoReadMetadata)
        .then(resp => {
          if (Ember.testing) {
            return;
          }
          if (!resp) {
            this.showDeleteModal = false;
            this.args.refresh();
            return;
          }
          if (resp.isAdapterError) {
            const errorMessage = getErrorMessage(resp.errors);
            this.flashMessages.danger(errorMessage);
          } else {
            // not likely to ever get to this situation, but adding just in case.
            location.reload();
          }
        });
    }
  }
}
